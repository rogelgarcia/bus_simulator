// src/graphics/gui/options/OptionsUI.js
// Tabbed Options UI overlay with persisted lighting controls.

import { getDefaultResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getDefaultResolvedShadowSettings } from '../../lighting/ShadowSettings.js';
import { getDefaultResolvedAntiAliasingSettings } from '../../visuals/postprocessing/AntiAliasingSettings.js';
import { getDefaultResolvedAmbientOcclusionSettings } from '../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { getDefaultResolvedBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { getDefaultResolvedSunBloomSettings } from '../../visuals/postprocessing/SunBloomSettings.js';
import { getDefaultResolvedColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { getColorGradingPresetOptions } from '../../visuals/postprocessing/ColorGradingPresets.js';
import { getDefaultResolvedBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { getDefaultResolvedAsphaltNoiseSettings } from '../../visuals/city/AsphaltNoiseSettings.js';
import { getDefaultResolvedSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { getSunFlarePresetById, getSunFlarePresetOptions } from '../../visuals/sun/SunFlarePresets.js';
import { getDefaultResolvedAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import {
    applyOptionsPresetToDraft,
    createOptionsPresetFromDraft,
    parseOptionsPresetJson,
    stringifyOptionsPreset
} from './OptionsPreset.js';

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
        getButton: (id) => buttons.get(String(id ?? '')) ?? null,
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

function normalizeHexColor(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    const v = raw.startsWith('#') ? raw.slice(1) : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        const r = v[0];
        const g = v[1];
        const b = v[2];
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`.toUpperCase();
    return null;
}

function makeColorRow({ label, value = '#FFFFFF', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'options-color';

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'options-number';

    const initial = normalizeHexColor(value) ?? '#FFFFFF';
    color.value = initial;
    text.value = initial;

    const emit = (raw) => {
        const normalized = normalizeHexColor(raw);
        if (!normalized) return;
        color.value = normalized;
        text.value = normalized;
        onChange?.(normalized);
    };

    color.addEventListener('input', () => emit(color.value));
    text.addEventListener('change', () => emit(text.value));
    text.addEventListener('blur', () => emit(text.value));

    right.appendChild(color);
    right.appendChild(text);
    row.appendChild(left);
    row.appendChild(right);
    return { row, color, text };
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

function downloadTextFile(filename, text) {
    const name = typeof filename === 'string' && filename.trim() ? filename.trim() : 'bus_sim_options_preset.json';
    const payload = typeof text === 'string' ? text : '';
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function copyTextToClipboard(text) {
    const payload = typeof text === 'string' ? text : '';
    if (!payload) return false;

    const clipboard = navigator?.clipboard ?? null;
    if (clipboard?.writeText) {
        try {
            await clipboard.writeText(payload);
            return true;
        } catch {}
    }

    const el = document.createElement('textarea');
    el.value = payload;
    el.setAttribute('readonly', 'readonly');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {}
    el.remove();
    return ok;
}

function formatIncludedGroups(includes) {
    const src = includes && typeof includes === 'object' ? includes : {};
    const keys = ['lighting', 'shadows', 'antiAliasing', 'ambientOcclusion', 'bloom', 'sunBloom', 'colorGrading', 'sunFlare', 'buildingWindowVisuals', 'asphaltNoise'];
    const enabled = keys.filter((k) => src[k] !== false);
    return enabled.length ? enabled.join(', ') : '(none)';
}

export class OptionsUI {
    constructor({
        visibleTabs = null,
        initialTab = 'lighting',
        initialLighting = null,
        initialAtmosphere = null,
        initialShadows = null,
        initialAntiAliasing = null,
        initialAmbientOcclusion = null,
        initialBloom = null,
        initialSunBloom = null,
        initialColorGrading = null,
        initialBuildingWindowVisuals = null,
        initialAsphaltNoise = null,
        initialSunFlare = null,
        initialPostProcessingActive = null,
        initialColorGradingDebug = null,
        initialVehicleMotionDebug = null,
        markingsCalibration = null,
        getIblDebugInfo = null,
        getPostProcessingDebugInfo = null,
        getAntiAliasingDebugInfo = null,
        getVehicleMotionDebugInfo = null,
        titleText = 'Options',
        subtitleText = '0 opens options · Esc closes',
        onCancel = null,
        onLiveChange = null,
        onSave = null
    } = {}) {
        this.onCancel = onCancel;
        this.onLiveChange = onLiveChange;
        this.onSave = onSave;
        this._getIblDebugInfo = typeof getIblDebugInfo === 'function' ? getIblDebugInfo : null;
        this._getPostProcessingDebugInfo = typeof getPostProcessingDebugInfo === 'function' ? getPostProcessingDebugInfo : null;
        this._getAntiAliasingDebugInfo = typeof getAntiAliasingDebugInfo === 'function' ? getAntiAliasingDebugInfo : null;
        this._getVehicleMotionDebugInfo = typeof getVehicleMotionDebugInfo === 'function' ? getVehicleMotionDebugInfo : null;
        this._iblDebugEls = null;
        this._postDebugEls = null;
        this._aaDebugEls = null;
        this._vehicleDebugEls = null;
        this._debugInterval = null;
        this._initialPostProcessingActive = initialPostProcessingActive !== null ? !!initialPostProcessingActive : null;
        this._initialColorGradingDebug = initialColorGradingDebug && typeof initialColorGradingDebug === 'object'
            ? JSON.parse(JSON.stringify(initialColorGradingDebug))
            : null;

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-options';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const title = makeEl('div', 'options-title', titleText);
        const subtitle = makeEl('div', 'options-subtitle', subtitleText);
        header.appendChild(title);
        header.appendChild(subtitle);

        this.tabs = makeEl('div', 'options-tabs');
        this._visibleTabs = (() => {
            const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const wantsDebugTab = params ? (params.get('debug') === 'true' || params.get('debugOptions') === 'true') : false;
            const base = ['lighting', 'graphics', 'sun_bloom', 'asphalt', 'grass', 'buildings'];
            if (wantsDebugTab) base.push('debug');
            if (!Array.isArray(visibleTabs)) return base;
            const out = [];
            for (const entry of visibleTabs) {
                const raw = String(entry ?? '').toLowerCase();
                const key = raw === 'gameplay' ? 'buildings' : (raw === 'sunbloom' ? 'sun_bloom' : raw);
                if (key !== 'lighting' && key !== 'graphics' && key !== 'sun_bloom' && key !== 'asphalt' && key !== 'grass' && key !== 'buildings' && key !== 'debug') continue;
                if (out.includes(key)) continue;
                out.push(key);
            }
            if (!out.length) return base;
            if (wantsDebugTab && !out.includes('debug')) out.push('debug');
            return out;
        })();

        const TAB_LABELS = {
            graphics: 'Graphics',
            lighting: 'Lighting',
            sun_bloom: 'Sun Bloom',
            asphalt: 'Asphalt',
            grass: 'Grass',
            buildings: 'Buildings',
            debug: 'Debug'
        };

        this.tabButtons = {};
        for (const key of this._visibleTabs) {
            const btn = makeEl('button', 'options-tab', TAB_LABELS[key] ?? key);
            btn.type = 'button';
            btn.addEventListener('click', () => this.setTab(key));
            this.tabs.appendChild(btn);
            this.tabButtons[key] = btn;
        }

        this.body = makeEl('div', 'options-body');

        this.footer = makeEl('div', 'options-footer');
        this.resetBtn = makeEl('button', 'options-btn', 'Reset');
        this.importBtn = makeEl('button', 'options-btn', 'Import');
        this.exportBtn = makeEl('button', 'options-btn', 'Export');
        this.cancelBtn = makeEl('button', 'options-btn', 'Cancel');
        this.saveBtn = makeEl('button', 'options-btn options-btn-primary', 'Save');
        this.resetBtn.type = 'button';
        this.importBtn.type = 'button';
        this.exportBtn.type = 'button';
        this.cancelBtn.type = 'button';
        this.saveBtn.type = 'button';

        this.resetBtn.addEventListener('click', () => this.resetToDefaults());
        this.importBtn.addEventListener('click', () => this._importPresetFromFile());
        this.exportBtn.addEventListener('click', () => this._exportPreset());
        this.cancelBtn.addEventListener('click', () => this.onCancel?.());
        this.saveBtn.addEventListener('click', () => this.onSave?.(this.getDraft()));

        this.footer.appendChild(this.resetBtn);
        this.footer.appendChild(this.importBtn);
        this.footer.appendChild(this.exportBtn);
        this.footer.appendChild(this.cancelBtn);
        this.footer.appendChild(this.saveBtn);

        this.panel.appendChild(header);
        this.panel.appendChild(this.tabs);
        this.panel.appendChild(this.body);
        this.panel.appendChild(this.footer);
        this.root.appendChild(this.panel);

        const desiredTab = (initialTab === 'buildings' || initialTab === 'gameplay')
            ? 'buildings'
            : (initialTab === 'graphics'
                ? 'graphics'
                : (initialTab === 'asphalt'
                    ? 'asphalt'
                    : (initialTab === 'grass'
                        ? 'grass'
                        : (initialTab === 'sun_bloom' || initialTab === 'sunbloom' ? 'sun_bloom' : 'lighting'))));
        this._tab = this._visibleTabs.includes(desiredTab) ? desiredTab : (this._visibleTabs[0] ?? desiredTab);
        this._draftLighting = initialLighting && typeof initialLighting === 'object'
            ? JSON.parse(JSON.stringify(initialLighting))
            : null;
        this._draftAtmosphere = initialAtmosphere && typeof initialAtmosphere === 'object'
            ? JSON.parse(JSON.stringify(initialAtmosphere))
            : null;
        this._draftShadows = initialShadows && typeof initialShadows === 'object'
            ? JSON.parse(JSON.stringify(initialShadows))
            : null;
        this._draftAntiAliasing = initialAntiAliasing && typeof initialAntiAliasing === 'object'
            ? JSON.parse(JSON.stringify(initialAntiAliasing))
            : null;
        this._draftAmbientOcclusion = initialAmbientOcclusion && typeof initialAmbientOcclusion === 'object'
            ? JSON.parse(JSON.stringify(initialAmbientOcclusion))
            : null;
        this._draftBloom = initialBloom && typeof initialBloom === 'object'
            ? JSON.parse(JSON.stringify(initialBloom))
            : null;
        this._draftSunBloom = initialSunBloom && typeof initialSunBloom === 'object'
            ? JSON.parse(JSON.stringify(initialSunBloom))
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
        this._draftVehicleMotionDebug = initialVehicleMotionDebug && typeof initialVehicleMotionDebug === 'object'
            ? JSON.parse(JSON.stringify(initialVehicleMotionDebug))
            : null;
        this._lightingControls = null;
        this._markingsCalibration = (() => {
            const cfg = markingsCalibration && typeof markingsCalibration === 'object' ? markingsCalibration : null;
            const onSample = typeof cfg?.onSample === 'function' ? cfg.onSample : null;
            if (!onSample) return null;
            return {
                targetYellow: typeof cfg?.targetYellow === 'string' ? cfg.targetYellow : null,
                targetWhite: typeof cfg?.targetWhite === 'string' ? cfg.targetWhite : null,
                noteText: typeof cfg?.noteText === 'string' ? cfg.noteText : null,
                onSample,
                state: { collapsed: cfg?.collapsedByDefault !== false, sampling: false, status: 'Ready', yellow: null, white: null }
            };
        })();

        this.setTab(this._tab);
    }

    _setDraftFromFullDraft(fullDraft) {
        const d = fullDraft && typeof fullDraft === 'object' ? fullDraft : null;
        if (!d) return;
        if (d.lighting) this._draftLighting = JSON.parse(JSON.stringify(d.lighting));
        if (d.atmosphere) this._draftAtmosphere = JSON.parse(JSON.stringify(d.atmosphere));
        if (d.shadows) this._draftShadows = JSON.parse(JSON.stringify(d.shadows));
        if (d.antiAliasing) this._draftAntiAliasing = JSON.parse(JSON.stringify(d.antiAliasing));
        if (d.ambientOcclusion) this._draftAmbientOcclusion = JSON.parse(JSON.stringify(d.ambientOcclusion));
        if (d.bloom) this._draftBloom = JSON.parse(JSON.stringify(d.bloom));
        if (d.sunBloom) this._draftSunBloom = JSON.parse(JSON.stringify(d.sunBloom));
        if (d.colorGrading) this._draftColorGrading = JSON.parse(JSON.stringify(d.colorGrading));
        if (d.sunFlare) this._draftSunFlare = JSON.parse(JSON.stringify(d.sunFlare));
        if (d.buildingWindowVisuals) this._draftBuildingWindowVisuals = JSON.parse(JSON.stringify(d.buildingWindowVisuals));
        if (d.asphaltNoise) this._draftAsphaltNoise = JSON.parse(JSON.stringify(d.asphaltNoise));
        if (d.vehicleMotionDebug) this._draftVehicleMotionDebug = JSON.parse(JSON.stringify(d.vehicleMotionDebug));
    }

    async _exportPreset() {
        const name = typeof window?.prompt === 'function'
            ? (window.prompt('Options preset name (optional)', '') ?? '')
            : '';
        const safeName = String(name || '').trim();
        const draft = this.getDraft();
        const preset = createOptionsPresetFromDraft(draft, { name: safeName || null });
        const json = stringifyOptionsPreset(preset);
        const fileName = safeName
            ? `bus_sim_options_preset_${safeName.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()}.json`
            : 'bus_sim_options_preset.json';

        downloadTextFile(fileName, json);
        const copied = await copyTextToClipboard(json);
        const groups = formatIncludedGroups(preset.includes);
        window.alert(`Exported options preset.\n\nIncludes: ${groups}\nDownloaded: ${fileName}\nCopied to clipboard: ${copied ? 'yes' : 'no'}`);
    }

    _importPresetFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', async () => {
            const file = input.files?.[0] ?? null;
            if (!file) return;
            let text = '';
            try {
                text = await file.text();
            } catch {
                window.alert('Failed to read preset file.');
                return;
            }

            let preset;
            try {
                preset = parseOptionsPresetJson(text);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
                window.alert(`Preset import failed: ${msg}`);
                return;
            }

            const merged = applyOptionsPresetToDraft(this.getDraft(), preset);
            this._setDraftFromFullDraft(merged);
            this._renderTab();
            this._emitLiveChange();
            const groups = formatIncludedGroups(preset.includes);
            window.alert(`Imported options preset.\n\nApplied: ${groups}`);
        });
        input.click();
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
        const desired = (key === 'debug')
            ? 'debug'
            : (key === 'buildings' || key === 'gameplay')
            ? 'buildings'
            : (key === 'graphics'
                ? 'graphics'
                : (key === 'asphalt'
                    ? 'asphalt'
                    : (key === 'grass'
                        ? 'grass'
                        : (key === 'sun_bloom' || key === 'sunbloom' ? 'sun_bloom' : 'lighting'))));
        const next = this._visibleTabs.includes(desired) ? desired : (this._visibleTabs[0] ?? desired);
        this._tab = next;
        for (const [k, btn] of Object.entries(this.tabButtons)) btn.classList.toggle('is-active', k === next);
        this._renderTab();
    }

    _renderTab() {
        this._iblDebugEls = null;
        this._postDebugEls = null;
        this._aaDebugEls = null;
        this._vehicleDebugEls = null;
        this.body.textContent = '';
        if (this._tab === 'graphics') return this._renderGraphicsTab();
        if (this._tab === 'lighting') return this._renderLightingTab();
        if (this._tab === 'sun_bloom') return this._renderSunBloomTab();
        if (this._tab === 'asphalt') return this._renderAsphaltTab();
        if (this._tab === 'grass') return this._renderGrassTab();
        if (this._tab === 'debug') return this._renderDebugTab();
        return this._renderBuildingsTab();
    }

    _startDebugRefresh() {
        if (this._debugInterval) return;
        if (!this._getIblDebugInfo && !this._getPostProcessingDebugInfo && !this._getAntiAliasingDebugInfo && !this._getVehicleMotionDebugInfo) return;
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
        this._refreshAntiAliasingDebug();
        this._refreshVehicleMotionDebug();
    }

	    _refreshIblDebug() {
	        const els = this._iblDebugEls;
	        if (!els || !this._getIblDebugInfo) return;

	        const info = this._getIblDebugInfo() ?? null;
	        const enabled = !!info?.enabled;
	        const envLoaded = !!info?.envMapLoaded;
	        const fallback = !!info?.usingFallbackEnvMap;
	        const wantsBg = !!info?.setBackground;
	        const hasBgTex = !!info?.hasBackgroundTexture;
	        const sceneEnv = !!info?.sceneHasEnvironment;
	        const sceneMatch = !!info?.sceneEnvironmentMatches;
	        const bgMode = String(info?.sceneBackgroundMode ?? 'none');
	        const hdrUrl = typeof info?.hdrUrl === 'string' ? info.hdrUrl : null;
	        const envMapHdrUrl = typeof info?.envMapHdrUrl === 'string' ? info.envMapHdrUrl : null;
	        const userDataKeys = Array.isArray(info?.envMapUserDataKeys) ? info.envMapUserDataKeys : null;
	        const intensity = Number.isFinite(info?.envMapIntensity) ? Number(info.envMapIntensity) : null;
	        const envIsTexture = info?.envMapIsTexture !== undefined ? !!info.envMapIsTexture : null;
	        const envType = typeof info?.envMapType === 'string' ? info.envMapType : null;
	        const envMapMapping = typeof info?.envMapMapping === 'string' ? info.envMapMapping : null;
	        const probeFound = !!info?.probeFound;
	        const probeHasEnvMap = !!info?.probeHasEnvMap;
	        const probeMatches = !!info?.probeEnvMapMatchesScene;
	        const probeEnvIsTexture = info?.probeEnvMapIsTexture !== undefined ? !!info.probeEnvMapIsTexture : null;
	        const probeEnvType = typeof info?.probeEnvMapType === 'string' ? info.probeEnvMapType : null;
	        const probeEnvMapMapping = typeof info?.probeEnvMapMapping === 'string' ? info.probeEnvMapMapping : null;
	        const probeIntensity = Number.isFinite(info?.probeEnvMapIntensity) ? Number(info.probeEnvMapIntensity) : null;
	        const probeMaterialType = typeof info?.probeMaterialType === 'string' ? info.probeMaterialType : null;
	        const probeMetalness = Number.isFinite(info?.probeMetalness) ? Number(info.probeMetalness) : null;
	        const probeRoughness = Number.isFinite(info?.probeRoughness) ? Number(info.probeRoughness) : null;
	        const probeScreenUv = info?.probeScreenUv ?? null;
	        const probeVisible = info?.probeVisible !== undefined ? !!info.probeVisible : null;
	        const probeScreenRadius = Number.isFinite(info?.probeScreenRadius) ? Number(info.probeScreenRadius) : null;

	        const invalidEnv = envLoaded && envIsTexture === false;
	        els.envMap.textContent = !enabled
	            ? 'Disabled'
	            : (envLoaded
	                ? (invalidEnv ? 'Loaded (invalid type)' : (fallback ? 'Loaded (fallback)' : 'Loaded'))
	                : 'Loading…');
	        els.sceneEnv.textContent = sceneEnv ? 'Set' : 'Null';
	        els.sceneMatch.textContent = sceneMatch ? 'Yes' : 'No';
	        els.sceneBg.textContent = bgMode === 'hdr' ? 'HDR' : (bgMode === 'other' ? 'Set (non-HDR)' : (bgMode === 'non-texture' ? 'Set (non-texture)' : 'Null'));
	        els.bgConfig.textContent = wantsBg ? (hasBgTex ? 'On (HDR ready)' : 'On (missing HDR tex)') : 'Off';
	        if (els.envIsTexture) {
	            els.envIsTexture.textContent = !enabled ? '-' : (envLoaded ? (envIsTexture === null ? '-' : (envIsTexture ? 'Yes' : 'No')) : '-');
	        }
	        if (els.envType) els.envType.textContent = !enabled ? '-' : (envLoaded ? (envType ?? '-') : '-');
	        if (els.envMapMapping) els.envMapMapping.textContent = envLoaded ? (envMapMapping ?? '-') : '-';
	        els.envUserData.textContent = envLoaded
	            ? `${envMapHdrUrl ? 'iblHdrUrl' : '-'}${userDataKeys?.length ? ` · ${userDataKeys.join(',')}` : ''}`
	            : '-';
	        els.hdrUrl.textContent = hdrUrl ?? '-';
	        els.intensity.textContent = intensity !== null ? intensity.toFixed(2) : '-';
	        if (els.probeEnvMap) {
	            if (!probeFound) {
	                els.probeEnvMap.textContent = 'Missing';
	            } else if (!probeHasEnvMap) {
	                els.probeEnvMap.textContent = 'Null';
	            } else if (probeEnvIsTexture === false) {
	                els.probeEnvMap.textContent = 'Set (invalid type)';
	            } else {
	                els.probeEnvMap.textContent = probeMatches ? 'Set (matches scene)' : 'Set';
	            }
	        }
	        if (els.probeEnvIsTexture) {
	            els.probeEnvIsTexture.textContent = !probeFound
	                ? 'Missing'
	                : (probeHasEnvMap ? (probeEnvIsTexture === null ? '-' : (probeEnvIsTexture ? 'Yes' : 'No')) : 'Null');
	        }
	        if (els.probeEnvType) {
	            els.probeEnvType.textContent = !probeFound
	                ? 'Missing'
	                : (probeHasEnvMap ? (probeEnvType ?? '-') : 'Null');
	        }
	        if (els.probeEnvMapMapping) {
	            els.probeEnvMapMapping.textContent = !probeFound ? 'Missing' : (probeHasEnvMap ? (probeEnvMapMapping ?? '-') : 'Null');
	        }
	        if (els.probeMaterial) {
	            if (!probeFound) {
	                els.probeMaterial.textContent = 'Missing';
	            } else {
	                const bits = [];
	                if (probeMaterialType) bits.push(probeMaterialType);
	                if (probeMetalness !== null) bits.push(`m${probeMetalness.toFixed(2)}`);
	                if (probeRoughness !== null) bits.push(`r${probeRoughness.toFixed(2)}`);
	                els.probeMaterial.textContent = bits.length ? bits.join(' ') : '-';
	            }
	        }
	        if (els.probeIntensity) {
	            els.probeIntensity.textContent = probeIntensity !== null ? probeIntensity.toFixed(2) : (probeFound ? '-' : 'Missing');
	        }
	        if (els.probeScreen) {
	            const u = Number(probeScreenUv?.u);
	            const v = Number(probeScreenUv?.v);
	            const inView = probeScreenUv?.inView !== undefined ? !!probeScreenUv.inView : null;
	            els.probeScreen.textContent = !probeFound
	                ? 'Missing'
	                : (Number.isFinite(u) && Number.isFinite(v)
	                    ? `${u.toFixed(3)},${v.toFixed(3)}${inView === false ? ' (off)' : ''}`
	                    : '-');
	        }
	        if (els.probeVisible) {
	            els.probeVisible.textContent = !probeFound ? 'Missing' : (probeVisible === null ? '-' : (probeVisible ? 'Yes' : 'No'));
	        }
	        if (els.probeRadius) {
	            els.probeRadius.textContent = !probeFound ? 'Missing' : (probeScreenRadius !== null ? probeScreenRadius.toFixed(4) : '-');
	        }
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

        if (els.ao) {
            const ao = info?.ambientOcclusion ?? null;
            if (!ao || typeof ao !== 'object') {
                els.ao.textContent = '-';
            } else {
                const mode = String(ao.mode ?? 'off');
                if (mode === 'off') {
                    els.ao.textContent = 'Off';
                } else if (mode === 'ssao') {
                    els.ao.textContent = 'SSAO';
                } else if (mode === 'gtao') {
                    const g = ao.gtao ?? null;
                    const updateMode = typeof g?.updateMode === 'string' ? g.updateMode : 'every_frame';
                    const labels = {
                        every_frame: 'every frame',
                        when_camera_moves: 'camera moves',
                        half_rate: 'half rate',
                        third_rate: 'third rate',
                        quarter_rate: 'quarter rate'
                    };
                    const modeLabel = labels[updateMode] ?? updateMode;
                    const updated = g?.updatedThisFrame === true;
                    const reason = typeof g?.updateReason === 'string' ? g.updateReason : null;
                    const age = Number.isFinite(g?.ageFrames) ? Number(g.ageFrames) : null;
                    const cacheSupported = g?.cacheSupported;
                    const status = updated ? `updated${reason ? ` (${reason})` : ''}` : (age !== null ? `cached (${age}f)` : 'cached');
                    const cache = cacheSupported === false ? ' (no cache)' : '';
                    els.ao.textContent = `GTAO (${modeLabel}) (${status})${cache}`;
                } else {
                    els.ao.textContent = mode.toUpperCase();
                }
            }
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

    _refreshAntiAliasingDebug() {
        const els = this._aaDebugEls;
        if (!els || !this._getAntiAliasingDebugInfo) return;

        const info = this._getAntiAliasingDebugInfo() ?? null;
        const pipelineActive = info?.pipelineActive !== undefined ? !!info.pipelineActive : false;
        const requestedMode = String(info?.requestedMode ?? 'off');
        const activeMode = String(info?.activeMode ?? 'off');
        const nativeAntialias = info?.nativeAntialias !== undefined ? !!info.nativeAntialias : null;

        if (els.pipeline) els.pipeline.textContent = pipelineActive ? 'On (composer)' : 'Off (direct)';
        if (els.native) els.native.textContent = nativeAntialias === null ? '-' : (nativeAntialias ? 'On' : 'Off');

        const activeLabel = requestedMode !== activeMode ? `${activeMode} (requested ${requestedMode})` : activeMode;
        if (els.active) els.active.textContent = activeLabel;

        const msaaSupported = info?.msaaSupported !== undefined ? !!info.msaaSupported : false;
        const maxSamples = Number.isFinite(info?.msaaMaxSamples) ? Number(info.msaaMaxSamples) : 0;
        const activeSamples = Number.isFinite(info?.msaaActiveSamples) ? Number(info.msaaActiveSamples) : 0;

        if (!els.msaa) return;
        if (!msaaSupported) {
            els.msaa.textContent = 'Not supported (WebGL2 required)';
            return;
        }
        if (!pipelineActive) {
            els.msaa.textContent = `Inactive (pipeline off, max ${maxSamples || '?'})`;
            return;
        }
        els.msaa.textContent = activeMode === 'msaa'
            ? `Active (${activeSamples || '?'}×, max ${maxSamples || '?'})`
            : `Supported (max ${maxSamples || '?'})`;
    }

    _refreshVehicleMotionDebug() {
        const els = this._vehicleDebugEls;
        if (!els || !this._getVehicleMotionDebugInfo) return;

        const info = this._getVehicleMotionDebugInfo() ?? null;
        const timing = info?.timing ?? null;
        const physics = info?.physicsLoop ?? null;
        const anchor = info?.anchor ?? null;
        const loco = info?.locomotion ?? null;
        const diff = info?.diff ?? null;
        const screen = info?.screen ?? null;

        if (els.dt) els.dt.textContent = timing && Number.isFinite(timing.dt) ? timing.dt.toFixed(4) : '-';
        if (els.fps) els.fps.textContent = timing && Number.isFinite(timing.fps) ? timing.fps.toFixed(1) : '-';
        if (els.rawDt) els.rawDt.textContent = timing && Number.isFinite(timing.rawDt) ? timing.rawDt.toFixed(4) : '-';
        if (els.synthetic) els.synthetic.textContent = timing?.synthetic?.pattern ?? 'off';

        if (els.fixedDt) els.fixedDt.textContent = physics && Number.isFinite(physics.fixedDt) ? physics.fixedDt.toFixed(4) : '-';
        if (els.subSteps) els.subSteps.textContent = physics?.subStepsLastFrame !== null && physics?.subStepsLastFrame !== undefined ? String(physics.subStepsLastFrame) : '-';
        if (els.alpha) els.alpha.textContent = physics && Number.isFinite(physics.alpha) ? physics.alpha.toFixed(3) : '-';

        if (els.anchorPos) {
            els.anchorPos.textContent = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z)
                ? `${anchor.x.toFixed(3)}, ${anchor.y.toFixed(3)}, ${anchor.z.toFixed(3)}`
                : '-';
        }
        if (els.anchorYaw) els.anchorYaw.textContent = anchor && Number.isFinite(anchor.yaw) ? `${(anchor.yaw * 180 / Math.PI).toFixed(1)}°` : '-';

        if (els.locoPos) {
            const p = loco?.position ?? null;
            els.locoPos.textContent = p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
                ? `${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`
                : '-';
        }
        if (els.locoSpeed) els.locoSpeed.textContent = Number.isFinite(loco?.speed) ? `${Number(loco.speed).toFixed(2)} m/s` : '-';

        if (els.posErr) els.posErr.textContent = Number.isFinite(diff?.dist) ? `${Number(diff.dist).toFixed(3)} m` : '-';
        if (els.yawErr) els.yawErr.textContent = Number.isFinite(diff?.yawErrDeg) ? `${Number(diff.yawErrDeg).toFixed(2)}°` : '-';
        if (els.screenPos) {
            els.screenPos.textContent = screen && Number.isFinite(screen.x) && Number.isFinite(screen.y)
                ? `${Number(screen.x).toFixed(1)}, ${Number(screen.y).toFixed(1)}`
                : '-';
        }
    }

    _ensureDraftAsphaltNoise() {
        const defaults = getDefaultResolvedAsphaltNoiseSettings();

	        if (!this._draftAsphaltNoise) {
	            this._draftAsphaltNoise = {
	                coarse: { ...defaults.coarse },
	                fine: { ...defaults.fine },
	                markings: { ...defaults.markings },
	                color: { ...defaults.color },
	                livedIn: JSON.parse(JSON.stringify(defaults.livedIn ?? {}))
	            };
	            return;
	        }

        const d = this._draftAsphaltNoise;

        if (!d.coarse || typeof d.coarse !== 'object') d.coarse = { ...defaults.coarse };
        const coarse = d.coarse;
        if (coarse.albedo === undefined) coarse.albedo = defaults.coarse.albedo;
        if (coarse.roughness === undefined) coarse.roughness = defaults.coarse.roughness;
        if (coarse.scale === undefined) coarse.scale = defaults.coarse.scale;
        if (coarse.colorStrength === undefined) coarse.colorStrength = defaults.coarse.colorStrength;
        if (coarse.dirtyStrength === undefined) coarse.dirtyStrength = defaults.coarse.dirtyStrength;
        if (coarse.roughnessStrength === undefined) coarse.roughnessStrength = defaults.coarse.roughnessStrength;

	        if (!d.fine || typeof d.fine !== 'object') d.fine = { ...defaults.fine };
	        const fine = d.fine;
	        if (fine.albedo === undefined) fine.albedo = defaults.fine.albedo;
	        if (fine.roughness === undefined) fine.roughness = defaults.fine.roughness;
	        if (fine.normal === undefined) fine.normal = defaults.fine.normal;
	        if (fine.scale === undefined) fine.scale = defaults.fine.scale;
	        if (fine.colorStrength === undefined) fine.colorStrength = defaults.fine.colorStrength;
	        if (fine.dirtyStrength === undefined) fine.dirtyStrength = defaults.fine.dirtyStrength;
	        if (fine.roughnessStrength === undefined) fine.roughnessStrength = defaults.fine.roughnessStrength;
	        if (fine.normalStrength === undefined) fine.normalStrength = defaults.fine.normalStrength;

	        if (!d.markings || typeof d.markings !== 'object') d.markings = { ...defaults.markings };
	        const markings = d.markings;
	        if (markings.enabled === undefined) markings.enabled = defaults.markings?.enabled ?? false;
	        if (markings.colorStrength === undefined) markings.colorStrength = defaults.markings?.colorStrength ?? 0.025;
	        if (markings.roughnessStrength === undefined) markings.roughnessStrength = defaults.markings?.roughnessStrength ?? 0.09;
	        if (markings.debug === undefined) markings.debug = defaults.markings?.debug ?? false;

        if (!d.color || typeof d.color !== 'object') d.color = { ...defaults.color };
        const color = d.color;
        if (color.value === undefined) color.value = defaults.color?.value ?? 0;
        if (color.warmCool === undefined) color.warmCool = defaults.color?.warmCool ?? 0;
        if (color.saturation === undefined) color.saturation = defaults.color?.saturation ?? 0;

        if (!d.livedIn || typeof d.livedIn !== 'object') d.livedIn = JSON.parse(JSON.stringify(defaults.livedIn ?? {}));
        const livedIn = d.livedIn;
        const livedInDefaults = defaults.livedIn ?? {};

        if (!livedIn.edgeDirt || typeof livedIn.edgeDirt !== 'object') livedIn.edgeDirt = { ...(livedInDefaults.edgeDirt ?? {}) };
        const edgeDirt = livedIn.edgeDirt;
        if (edgeDirt.enabled === undefined) edgeDirt.enabled = livedInDefaults.edgeDirt?.enabled;
        if (edgeDirt.strength === undefined) edgeDirt.strength = livedInDefaults.edgeDirt?.strength;
        if (edgeDirt.width === undefined) edgeDirt.width = livedInDefaults.edgeDirt?.width;
        if (edgeDirt.scale === undefined) edgeDirt.scale = livedInDefaults.edgeDirt?.scale;

        if (!livedIn.sidewalkGrassEdgeStrip || typeof livedIn.sidewalkGrassEdgeStrip !== 'object') {
            livedIn.sidewalkGrassEdgeStrip = { ...(livedInDefaults.sidewalkGrassEdgeStrip ?? {}) };
        }
        const sidewalkGrassEdgeStrip = livedIn.sidewalkGrassEdgeStrip;
        if (sidewalkGrassEdgeStrip.enabled === undefined) sidewalkGrassEdgeStrip.enabled = livedInDefaults.sidewalkGrassEdgeStrip?.enabled;
        if (sidewalkGrassEdgeStrip.width === undefined) sidewalkGrassEdgeStrip.width = livedInDefaults.sidewalkGrassEdgeStrip?.width;
        if (sidewalkGrassEdgeStrip.opacity === undefined) sidewalkGrassEdgeStrip.opacity = livedInDefaults.sidewalkGrassEdgeStrip?.opacity;
        if (sidewalkGrassEdgeStrip.roughness === undefined) sidewalkGrassEdgeStrip.roughness = livedInDefaults.sidewalkGrassEdgeStrip?.roughness;
        if (sidewalkGrassEdgeStrip.metalness === undefined) sidewalkGrassEdgeStrip.metalness = livedInDefaults.sidewalkGrassEdgeStrip?.metalness;
        if (sidewalkGrassEdgeStrip.colorHex === undefined) sidewalkGrassEdgeStrip.colorHex = livedInDefaults.sidewalkGrassEdgeStrip?.colorHex;
        if (sidewalkGrassEdgeStrip.fadePower === undefined) sidewalkGrassEdgeStrip.fadePower = livedInDefaults.sidewalkGrassEdgeStrip?.fadePower;

        if (!livedIn.cracks || typeof livedIn.cracks !== 'object') livedIn.cracks = { ...(livedInDefaults.cracks ?? {}) };
        const cracks = livedIn.cracks;
        if (cracks.enabled === undefined) cracks.enabled = livedInDefaults.cracks?.enabled;
        if (cracks.strength === undefined) cracks.strength = livedInDefaults.cracks?.strength;
        if (cracks.scale === undefined) cracks.scale = livedInDefaults.cracks?.scale;

        if (!livedIn.patches || typeof livedIn.patches !== 'object') livedIn.patches = { ...(livedInDefaults.patches ?? {}) };
        const patches = livedIn.patches;
        if (patches.enabled === undefined) patches.enabled = livedInDefaults.patches?.enabled;
        if (patches.strength === undefined) patches.strength = livedInDefaults.patches?.strength;
        if (patches.scale === undefined) patches.scale = livedInDefaults.patches?.scale;
        if (patches.coverage === undefined) patches.coverage = livedInDefaults.patches?.coverage;

        if (!livedIn.tireWear || typeof livedIn.tireWear !== 'object') livedIn.tireWear = { ...(livedInDefaults.tireWear ?? {}) };
        const tireWear = livedIn.tireWear;
        if (tireWear.enabled === undefined) tireWear.enabled = livedInDefaults.tireWear?.enabled;
        if (tireWear.strength === undefined) tireWear.strength = livedInDefaults.tireWear?.strength;
        if (tireWear.scale === undefined) tireWear.scale = livedInDefaults.tireWear?.scale;
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

    _ensureDraftAtmosphere() {
        if (this._draftAtmosphere) return;
        const d = getDefaultResolvedAtmosphereSettings();
        this._draftAtmosphere = JSON.parse(JSON.stringify(d));
    }

    _ensureDraftShadows() {
        if (this._draftShadows) return;
        const d = getDefaultResolvedShadowSettings();
        this._draftShadows = JSON.parse(JSON.stringify(d));
    }

    _ensureDraftAntiAliasing() {
        const defaults = getDefaultResolvedAntiAliasingSettings();

        if (!this._draftAntiAliasing) {
            this._draftAntiAliasing = JSON.parse(JSON.stringify(defaults));
            return;
        }

        const d = this._draftAntiAliasing;

        if (d.mode === undefined) d.mode = defaults.mode;

        if (!d.msaa || typeof d.msaa !== 'object') d.msaa = { ...defaults.msaa };
        if (d.msaa.samples === undefined) d.msaa.samples = defaults.msaa.samples;

        if (!d.taa || typeof d.taa !== 'object') d.taa = { ...defaults.taa };
        if (d.taa.preset === undefined) d.taa.preset = defaults.taa.preset;
        if (d.taa.historyStrength === undefined) d.taa.historyStrength = defaults.taa.historyStrength;
        if (d.taa.jitter === undefined) d.taa.jitter = defaults.taa.jitter;
        if (d.taa.sharpen === undefined) d.taa.sharpen = defaults.taa.sharpen;
        if (d.taa.clampStrength === undefined) d.taa.clampStrength = defaults.taa.clampStrength;

        if (!d.smaa || typeof d.smaa !== 'object') d.smaa = { ...defaults.smaa };
        if (d.smaa.preset === undefined) d.smaa.preset = defaults.smaa.preset;
        if (d.smaa.threshold === undefined) d.smaa.threshold = defaults.smaa.threshold;
        if (d.smaa.maxSearchSteps === undefined) d.smaa.maxSearchSteps = defaults.smaa.maxSearchSteps;
        if (d.smaa.maxSearchStepsDiag === undefined) d.smaa.maxSearchStepsDiag = defaults.smaa.maxSearchStepsDiag;
        if (d.smaa.cornerRounding === undefined) d.smaa.cornerRounding = defaults.smaa.cornerRounding;

        if (!d.fxaa || typeof d.fxaa !== 'object') d.fxaa = { ...defaults.fxaa };
        if (d.fxaa.preset === undefined) d.fxaa.preset = defaults.fxaa.preset;
        if (d.fxaa.edgeThreshold === undefined) d.fxaa.edgeThreshold = defaults.fxaa.edgeThreshold;
    }

    _ensureDraftAmbientOcclusion() {
        const defaults = getDefaultResolvedAmbientOcclusionSettings();

        if (!this._draftAmbientOcclusion) {
            this._draftAmbientOcclusion = JSON.parse(JSON.stringify(defaults));
            return;
        }

        const d = this._draftAmbientOcclusion;
        if (d.mode === undefined) d.mode = defaults.mode;

        if (!d.alpha || typeof d.alpha !== 'object') d.alpha = { ...defaults.alpha };
        if (d.alpha.handling === undefined) d.alpha.handling = defaults.alpha.handling;
        if (d.alpha.threshold === undefined) d.alpha.threshold = defaults.alpha.threshold;

        if (!d.staticAo || typeof d.staticAo !== 'object') d.staticAo = { ...defaults.staticAo };
        if (d.staticAo.mode === undefined) d.staticAo.mode = defaults.staticAo.mode;
        if (d.staticAo.intensity === undefined) d.staticAo.intensity = defaults.staticAo.intensity;
        if (d.staticAo.quality === undefined) d.staticAo.quality = defaults.staticAo.quality;
        if (d.staticAo.radius === undefined) d.staticAo.radius = defaults.staticAo.radius;
        if (d.staticAo.wallHeight === undefined) d.staticAo.wallHeight = defaults.staticAo.wallHeight;
        if (d.staticAo.debugView === undefined) d.staticAo.debugView = defaults.staticAo.debugView;

        if (!d.busContactShadow || typeof d.busContactShadow !== 'object') d.busContactShadow = { ...defaults.busContactShadow };
        if (d.busContactShadow.enabled === undefined) d.busContactShadow.enabled = defaults.busContactShadow.enabled;
        if (d.busContactShadow.intensity === undefined) d.busContactShadow.intensity = defaults.busContactShadow.intensity;
        if (d.busContactShadow.radius === undefined) d.busContactShadow.radius = defaults.busContactShadow.radius;
        if (d.busContactShadow.softness === undefined) d.busContactShadow.softness = defaults.busContactShadow.softness;
        if (d.busContactShadow.maxDistance === undefined) d.busContactShadow.maxDistance = defaults.busContactShadow.maxDistance;

        if (!d.ssao || typeof d.ssao !== 'object') d.ssao = { ...defaults.ssao };
        if (d.ssao.intensity === undefined) d.ssao.intensity = defaults.ssao.intensity;
        if (d.ssao.radius === undefined) d.ssao.radius = defaults.ssao.radius;
        if (d.ssao.quality === undefined) d.ssao.quality = defaults.ssao.quality;

        if (!d.gtao || typeof d.gtao !== 'object') d.gtao = { ...defaults.gtao };
        if (d.gtao.intensity === undefined) d.gtao.intensity = defaults.gtao.intensity;
        if (d.gtao.radius === undefined) d.gtao.radius = defaults.gtao.radius;
        if (d.gtao.quality === undefined) d.gtao.quality = defaults.gtao.quality;
        if (d.gtao.denoise === undefined) d.gtao.denoise = defaults.gtao.denoise;
        if (d.gtao.updateMode === undefined) d.gtao.updateMode = defaults.gtao.updateMode;

        if (!d.gtao.motionThreshold || typeof d.gtao.motionThreshold !== 'object') d.gtao.motionThreshold = { ...(defaults.gtao.motionThreshold ?? {}) };
        if (d.gtao.motionThreshold.positionMeters === undefined) d.gtao.motionThreshold.positionMeters = defaults.gtao.motionThreshold.positionMeters;
        if (d.gtao.motionThreshold.rotationDeg === undefined) d.gtao.motionThreshold.rotationDeg = defaults.gtao.motionThreshold.rotationDeg;
        if (d.gtao.motionThreshold.fovDeg === undefined) d.gtao.motionThreshold.fovDeg = defaults.gtao.motionThreshold.fovDeg;
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

    _ensureDraftSunBloom() {
        if (this._draftSunBloom) return;
        const d = getDefaultResolvedSunBloomSettings();
        this._draftSunBloom = JSON.parse(JSON.stringify(d));
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
        const d = getDefaultResolvedSunFlareSettings();
        if (!this._draftSunFlare) {
            this._draftSunFlare = {
                enabled: d.enabled,
                preset: d.preset,
                strength: d.strength,
                components: { ...(d.components ?? {}) }
            };
            return;
        }

        const s = this._draftSunFlare;
        if (!s.components || typeof s.components !== 'object') s.components = { ...(d.components ?? {}) };
        const c = s.components;
        const defaults = d.components ?? {};
        if (c.core === undefined) c.core = !!defaults.core;
        if (c.halo === undefined) c.halo = !!defaults.halo;
        if (c.starburst === undefined) c.starburst = !!defaults.starburst;
        if (c.ghosting === undefined) c.ghosting = !!defaults.ghosting;
    }

    _ensureDraftVehicleMotionDebug() {
        if (!this._draftVehicleMotionDebug) {
            this._draftVehicleMotionDebug = {
                enabled: false,
                overlay: true,
                logSpikes: false,
                logCameraCatchup: false,
                logCameraLag: false,
                logCameraEvents: false,
                logCameraTargetMismatch: false,
                logGate: { minScreenPx: 3 },
                camera: { freeze: false },
                backStep: { minProjMeters: 0.05 },
                cameraCatchup: { minDfwdMeters: 0.05, minCameraMoveMeters: 0.01, minCamBusDistDropMeters: 0.05 },
                cameraLag: { minBusStepMeters: 0.2, maxCamStepRatio: 0.55 },
                cameraTargetMismatch: { minAnchorMatrixErrMeters: 0.02 },
                spike: { maxDistMeters: 0.9, maxYawDeg: 25, maxScreenPx: 18 },
                syntheticDt: { enabled: false, pattern: 'off', mode: 'stall', stallMs: 34 }
            };
            return;
        }

        const d = this._draftVehicleMotionDebug;
        if (d.enabled === undefined) d.enabled = false;
        if (d.overlay === undefined) d.overlay = true;
        if (d.logSpikes === undefined) d.logSpikes = false;
        if (d.logCameraCatchup === undefined) d.logCameraCatchup = false;
        if (d.logCameraLag === undefined) d.logCameraLag = false;
        if (d.logCameraEvents === undefined) d.logCameraEvents = false;
        if (d.logCameraTargetMismatch === undefined) d.logCameraTargetMismatch = false;
        if (!d.logGate || typeof d.logGate !== 'object') d.logGate = { minScreenPx: 3 };
        if (d.logGate.minScreenPx === undefined) d.logGate.minScreenPx = 3;
        if (!d.camera || typeof d.camera !== 'object') d.camera = { freeze: false };
        if (d.camera.freeze === undefined) d.camera.freeze = false;
        if (!d.backStep || typeof d.backStep !== 'object') d.backStep = { minProjMeters: 0.05 };
        if (d.backStep.minProjMeters === undefined) d.backStep.minProjMeters = 0.05;
        if (!d.cameraCatchup || typeof d.cameraCatchup !== 'object') d.cameraCatchup = { minDfwdMeters: 0.05, minCameraMoveMeters: 0.01, minCamBusDistDropMeters: 0.05 };
        if (d.cameraCatchup.minDfwdMeters === undefined) d.cameraCatchup.minDfwdMeters = 0.05;
        if (d.cameraCatchup.minCameraMoveMeters === undefined) d.cameraCatchup.minCameraMoveMeters = 0.01;
        if (d.cameraCatchup.minCamBusDistDropMeters === undefined) d.cameraCatchup.minCamBusDistDropMeters = 0.05;
        if (!d.cameraLag || typeof d.cameraLag !== 'object') d.cameraLag = { minBusStepMeters: 0.2, maxCamStepRatio: 0.55 };
        if (d.cameraLag.minBusStepMeters === undefined) d.cameraLag.minBusStepMeters = 0.2;
        if (d.cameraLag.maxCamStepRatio === undefined) d.cameraLag.maxCamStepRatio = 0.55;
        if (!d.cameraTargetMismatch || typeof d.cameraTargetMismatch !== 'object') d.cameraTargetMismatch = { minAnchorMatrixErrMeters: 0.02 };
        if (d.cameraTargetMismatch.minAnchorMatrixErrMeters === undefined) d.cameraTargetMismatch.minAnchorMatrixErrMeters = 0.02;
        if (!d.spike || typeof d.spike !== 'object') d.spike = { maxDistMeters: 0.9, maxYawDeg: 25, maxScreenPx: 18 };
        if (d.spike.maxDistMeters === undefined) d.spike.maxDistMeters = 0.9;
        if (d.spike.maxYawDeg === undefined) d.spike.maxYawDeg = 25;
        if (d.spike.maxScreenPx === undefined) d.spike.maxScreenPx = 18;
        if (!d.syntheticDt || typeof d.syntheticDt !== 'object') d.syntheticDt = { enabled: false, pattern: 'off', mode: 'stall', stallMs: 34 };
        if (d.syntheticDt.enabled === undefined) d.syntheticDt.enabled = false;
        if (d.syntheticDt.pattern === undefined) d.syntheticDt.pattern = 'off';
        if (d.syntheticDt.mode === undefined) d.syntheticDt.mode = 'stall';
        if (d.syntheticDt.stallMs === undefined) d.syntheticDt.stallMs = 34;
    }

    _renderAsphaltTab() {
        this._ensureDraftAsphaltNoise();

	        const d = this._draftAsphaltNoise;
	        const coarse = d.coarse ?? (d.coarse = {});
	        const fine = d.fine ?? (d.fine = {});
	        const markings = d.markings ?? (d.markings = {});
	        const color = d.color ?? (d.color = {});
	        const livedIn = d.livedIn ?? (d.livedIn = {});
	        const edgeDirt = livedIn.edgeDirt ?? (livedIn.edgeDirt = {});
	        const cracks = livedIn.cracks ?? (livedIn.cracks = {});
	        const patches = livedIn.patches ?? (livedIn.patches = {});
	        const tireWear = livedIn.tireWear ?? (livedIn.tireWear = {});
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

	        const sectionMarkings = makeEl('div', 'options-section');
	        sectionMarkings.appendChild(makeEl('div', 'options-section-title', 'Markings'));

	        const markingsControls = {
	            enabled: makeToggleRow({
	                label: 'Apply asphalt noise to markings',
	                value: markings.enabled,
	                onChange: (v) => { markings.enabled = v; emit(); }
	            }),
	            colorStrength: makeNumberSliderRow({
	                label: 'Markings noise color strength',
	                value: markings.colorStrength ?? 0.025,
	                min: 0,
	                max: 0.5,
	                step: 0.005,
	                digits: 3,
	                onChange: (v) => { markings.colorStrength = v; emit(); }
	            }),
	            roughnessStrength: makeNumberSliderRow({
	                label: 'Markings noise roughness strength',
	                value: markings.roughnessStrength ?? 0.09,
	                min: 0,
	                max: 0.5,
	                step: 0.005,
	                digits: 3,
	                onChange: (v) => { markings.roughnessStrength = v; emit(); }
	            }),
	            debug: makeToggleRow({
	                label: 'Debug: show markings noise',
	                value: markings.debug,
	                onChange: (v) => { markings.debug = v; emit(); }
	            })
	        };

	        const setMarkingsControlsEnabled = (enabled) => {
	            const off = !enabled;
	            markingsControls.colorStrength.range.disabled = off;
	            markingsControls.colorStrength.number.disabled = off;
	            markingsControls.roughnessStrength.range.disabled = off;
	            markingsControls.roughnessStrength.number.disabled = off;
	        };

	        setMarkingsControlsEnabled(!!markings.enabled);
	        markingsControls.enabled.toggle.addEventListener('change', () => setMarkingsControlsEnabled(!!markingsControls.enabled.toggle.checked));

	        sectionMarkings.appendChild(markingsControls.enabled.row);
	        sectionMarkings.appendChild(markingsControls.colorStrength.row);
	        sectionMarkings.appendChild(markingsControls.roughnessStrength.row);
	        sectionMarkings.appendChild(markingsControls.debug.row);

	        const sectionMarkingsCalibration = (() => {
	            const cfg = this._markingsCalibration;
	            if (!cfg) return null;

	            const state = cfg.state ?? (cfg.state = {});
	            let collapsed = state.collapsed !== undefined ? !!state.collapsed : true;

	            const section = makeEl('div', 'options-section');
	            const header = makeEl('div', 'options-section-header');
	            header.setAttribute('role', 'button');
	            header.tabIndex = 0;

	            const title = makeEl('div', 'options-section-title', 'Markings Calibration');
	            const collapseBtn = makeEl('button', 'options-btn options-btn-small options-icon-btn', collapsed ? '▸' : '▾');
	            collapseBtn.type = 'button';

	            const applyCollapsed = () => {
	                section.classList.toggle('is-collapsed', collapsed);
	                collapseBtn.textContent = collapsed ? '▸' : '▾';
	                collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
	                collapseBtn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
	            };

	            const toggleCollapsed = () => {
	                collapsed = !collapsed;
	                state.collapsed = collapsed;
	                applyCollapsed();
	            };

	            collapseBtn.addEventListener('click', () => toggleCollapsed());
	            header.addEventListener('click', (e) => {
	                const btn = e?.target?.closest?.('button');
	                if (btn && header.contains(btn)) return;
	                toggleCollapsed();
	            });
	            header.addEventListener('keydown', (e) => {
	                const key = e?.key ?? '';
	                if (key !== 'Enter' && key !== ' ') return;
	                e.preventDefault?.();
	                toggleCollapsed();
	            });

	            header.appendChild(title);
	            header.appendChild(collapseBtn);
	            section.appendChild(header);

	            const targetYellow = String(cfg.targetYellow ?? '-').toUpperCase();
	            const targetWhite = String(cfg.targetWhite ?? '-').toUpperCase();
	            const statusRow = makeValueRow({ label: 'Status', value: String(state.status ?? 'Ready') });
	            const targetYellowRow = makeValueRow({ label: 'Yellow target', value: targetYellow });
	            const targetWhiteRow = makeValueRow({ label: 'White target', value: targetWhite });
	            const measuredYellowRow = makeValueRow({ label: 'Yellow measured', value: String(state.yellow?.hex ?? '-').toUpperCase() });
	            const yellowSampleRow = makeValueRow({ label: 'Yellow sample', value: state.yellow?.sample ? `${state.yellow.sample.x},${state.yellow.sample.y} (avg ${state.yellow.sample.size}x${state.yellow.sample.size})` : '-' });
	            const measuredWhiteRow = makeValueRow({ label: 'White measured', value: String(state.white?.hex ?? '-').toUpperCase() });
	            const whiteSampleRow = makeValueRow({ label: 'White sample', value: state.white?.sample ? `${state.white.sample.x},${state.white.sample.y} (avg ${state.white.sample.size}x${state.white.sample.size})` : '-' });

	            const sampleRow = makeEl('div', 'options-row');
	            const sampleLabel = makeEl('div', 'options-row-label', 'Sample');
	            const sampleControl = makeEl('div', 'options-row-control');
	            const sampleBtn = makeEl('button', 'options-btn options-btn-primary', 'Sample Colors');
	            sampleBtn.type = 'button';
	            sampleControl.appendChild(sampleBtn);
	            sampleRow.appendChild(sampleLabel);
	            sampleRow.appendChild(sampleControl);

	            const setBusy = (busy) => {
	                const on = !!busy;
	                state.sampling = on;
	                sampleBtn.disabled = on;
	                sampleBtn.textContent = on ? 'Sampling…' : 'Sample Colors';
	            };

	            const setStatus = (text) => {
	                state.status = String(text ?? '');
	                statusRow.text.textContent = state.status;
	            };

	            const syncResults = () => {
	                measuredYellowRow.text.textContent = String(state.yellow?.hex ?? '-').toUpperCase();
	                yellowSampleRow.text.textContent = state.yellow?.sample
	                    ? `${state.yellow.sample.x},${state.yellow.sample.y} (avg ${state.yellow.sample.size}x${state.yellow.sample.size})`
	                    : '-';
	                measuredWhiteRow.text.textContent = String(state.white?.hex ?? '-').toUpperCase();
	                whiteSampleRow.text.textContent = state.white?.sample
	                    ? `${state.white.sample.x},${state.white.sample.y} (avg ${state.white.sample.size}x${state.white.sample.size})`
	                    : '-';
	            };

	            sampleBtn.addEventListener('click', async () => {
	                if (state.sampling) return;
	                setBusy(true);
	                setStatus('Sampling…');
	                try {
	                    const res = await Promise.resolve(cfg.onSample());
	                    if (!res || typeof res !== 'object') throw new Error('Sampling returned no result.');
	                    if (!res.yellow || !res.white) throw new Error('Missing measured colors.');
	                    state.yellow = res.yellow;
	                    state.white = res.white;
	                    setStatus('OK');
	                    syncResults();
	                } catch (err) {
	                    const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
	                    console.error('[OptionsUI] Markings calibration sample failed', err);
	                    setStatus(`Error: ${msg}`);
	                } finally {
	                    setBusy(false);
	                }
	            });

	            const note = makeEl('div', 'options-note');
	            note.textContent = cfg.noteText || 'Samples on-screen sRGB at fixed points on the lane markings (uses current lighting + tone mapping).';

	            section.appendChild(statusRow.row);
	            section.appendChild(targetYellowRow.row);
	            section.appendChild(targetWhiteRow.row);
	            section.appendChild(measuredYellowRow.row);
	            section.appendChild(yellowSampleRow.row);
	            section.appendChild(measuredWhiteRow.row);
	            section.appendChild(whiteSampleRow.row);
	            section.appendChild(sampleRow);
	            section.appendChild(note);

	            applyCollapsed();
	            setBusy(!!state.sampling);
	            syncResults();
	            return section;
	        })();

	        const sectionColor = makeEl('div', 'options-section');
	        sectionColor.appendChild(makeEl('div', 'options-section-title', 'Color'));

        const colorControls = {
            value: makeNumberSliderRow({
                label: 'Asphalt value (bright/dark)',
                value: color.value ?? 0,
                min: -0.35,
                max: 0.35,
                step: 0.01,
                digits: 2,
                onChange: (v) => { color.value = v; emit(); }
            }),
            warmCool: makeNumberSliderRow({
                label: 'Warm/cool tint',
                value: color.warmCool ?? 0,
                min: -0.25,
                max: 0.25,
                step: 0.01,
                digits: 2,
                onChange: (v) => { color.warmCool = v; emit(); }
            }),
            saturation: makeNumberSliderRow({
                label: 'Saturation',
                value: color.saturation ?? 0,
                min: -0.5,
                max: 0.5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { color.saturation = v; emit(); }
            })
        };

        sectionColor.appendChild(colorControls.value.row);
        sectionColor.appendChild(colorControls.warmCool.row);
        sectionColor.appendChild(colorControls.saturation.row);

        const sectionLivedIn = makeEl('div', 'options-section');
        sectionLivedIn.appendChild(makeEl('div', 'options-section-title', 'Lived-in'));

        const livedInControls = {
            edgeDirtEnabled: makeToggleRow({
                label: 'Edge dirt',
                value: edgeDirt.enabled,
                onChange: (v) => { edgeDirt.enabled = v; emit(); }
            }),
            edgeDirtStrength: makeNumberSliderRow({
                label: 'Edge dirt strength',
                value: edgeDirt.strength ?? 0.35,
                min: 0,
                max: 4,
                step: 0.01,
                digits: 2,
                onChange: (v) => { edgeDirt.strength = v; emit(); }
            }),
            edgeDirtWidth: makeNumberSliderRow({
                label: 'Edge dirt width (m)',
                value: edgeDirt.width ?? 0.65,
                min: 0,
                max: 2.5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { edgeDirt.width = v; emit(); }
            }),
            edgeDirtScale: makeNumberSliderRow({
                label: 'Edge dirt scale',
                value: edgeDirt.scale ?? 0.55,
                min: 0.05,
                max: 10,
                step: 0.01,
                digits: 2,
                onChange: (v) => { edgeDirt.scale = v; emit(); }
            }),

            cracksEnabled: makeToggleRow({
                label: 'Cracks',
                value: cracks.enabled,
                onChange: (v) => { cracks.enabled = v; emit(); }
            }),
            cracksStrength: makeNumberSliderRow({
                label: 'Cracks strength',
                value: cracks.strength ?? 0.25,
                min: 0,
                max: 4,
                step: 0.01,
                digits: 2,
                onChange: (v) => { cracks.strength = v; emit(); }
            }),
            cracksScale: makeNumberSliderRow({
                label: 'Cracks scale',
                value: cracks.scale ?? 3.2,
                min: 0.1,
                max: 25,
                step: 0.1,
                digits: 1,
                onChange: (v) => { cracks.scale = v; emit(); }
            }),

            patchesEnabled: makeToggleRow({
                label: 'Patch repairs',
                value: patches.enabled,
                onChange: (v) => { patches.enabled = v; emit(); }
            }),
            patchesStrength: makeNumberSliderRow({
                label: 'Patch strength',
                value: patches.strength ?? 0.2,
                min: 0,
                max: 4,
                step: 0.01,
                digits: 2,
                onChange: (v) => { patches.strength = v; emit(); }
            }),
            patchesScale: makeNumberSliderRow({
                label: 'Patch scale',
                value: patches.scale ?? 4.0,
                min: 0.1,
                max: 25,
                step: 0.1,
                digits: 1,
                onChange: (v) => { patches.scale = v; emit(); }
            }),
            patchesCoverage: makeNumberSliderRow({
                label: 'Patch coverage',
                value: patches.coverage ?? 0.84,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { patches.coverage = v; emit(); }
            }),

            tireWearEnabled: makeToggleRow({
                label: 'Tire wear / polish',
                value: tireWear.enabled,
                onChange: (v) => { tireWear.enabled = v; emit(); }
            }),
            tireWearStrength: makeNumberSliderRow({
                label: 'Tire wear strength',
                value: tireWear.strength ?? 0.25,
                min: 0,
                max: 4,
                step: 0.01,
                digits: 2,
                onChange: (v) => { tireWear.strength = v; emit(); }
            }),
            tireWearScale: makeNumberSliderRow({
                label: 'Tire wear scale',
                value: tireWear.scale ?? 1.6,
                min: 0.1,
                max: 25,
                step: 0.1,
                digits: 1,
                onChange: (v) => { tireWear.scale = v; emit(); }
            })
        };

        sectionLivedIn.appendChild(livedInControls.edgeDirtEnabled.row);
        sectionLivedIn.appendChild(livedInControls.edgeDirtStrength.row);
        sectionLivedIn.appendChild(livedInControls.edgeDirtWidth.row);
        sectionLivedIn.appendChild(livedInControls.edgeDirtScale.row);
        sectionLivedIn.appendChild(livedInControls.cracksEnabled.row);
        sectionLivedIn.appendChild(livedInControls.cracksStrength.row);
        sectionLivedIn.appendChild(livedInControls.cracksScale.row);
        sectionLivedIn.appendChild(livedInControls.patchesEnabled.row);
        sectionLivedIn.appendChild(livedInControls.patchesStrength.row);
        sectionLivedIn.appendChild(livedInControls.patchesScale.row);
        sectionLivedIn.appendChild(livedInControls.patchesCoverage.row);
        sectionLivedIn.appendChild(livedInControls.tireWearEnabled.row);
        sectionLivedIn.appendChild(livedInControls.tireWearStrength.row);
        sectionLivedIn.appendChild(livedInControls.tireWearScale.row);

        const note = makeEl('div', 'options-note');
        note.textContent = 'Coarse drives large-area breakup; Fine adds grain. Color and lived-in overlays help tune realism without swapping textures.';

	        this.body.appendChild(sectionCoarse);
	        this.body.appendChild(sectionFine);
	        this.body.appendChild(sectionMarkings);
	        if (sectionMarkingsCalibration) this.body.appendChild(sectionMarkingsCalibration);
	        this.body.appendChild(sectionColor);
	        this.body.appendChild(sectionLivedIn);
	        this.body.appendChild(note);
	    }

    _renderGrassTab() {
        this._ensureDraftAsphaltNoise();

        const d = this._draftAsphaltNoise;
        const livedIn = d.livedIn ?? (d.livedIn = {});
        const strip = livedIn.sidewalkGrassEdgeStrip ?? (livedIn.sidewalkGrassEdgeStrip = {});
        const emit = () => this._emitLiveChange();

        const section = makeEl('div', 'options-section');
        section.appendChild(makeEl('div', 'options-section-title', 'Sidewalk Edge Blend'));

        const controls = {
            enabled: makeToggleRow({
                label: 'Sidewalk grass-edge dirt strip',
                value: strip.enabled,
                onChange: (v) => { strip.enabled = v; emit(); }
            })
        };

        section.appendChild(controls.enabled.row);

        const note = makeEl('div', 'options-note');
        note.textContent = 'Adds a subtle dirt/wear strip where sidewalks transition into grass/ground.';

        this.body.appendChild(section);
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
                label: 'Window glass reflection intensity',
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
        note.textContent = 'Changes apply live to the current scene. Save to persist. If you still don’t see reflections, reload (to regenerate buildings/materials).';

        this.body.appendChild(sectionBuildings);
        this.body.appendChild(note);
    }

    _renderSunBloomTab() {
        this._ensureDraftSunBloom();
        const sunBloom = this._draftSunBloom;
        const emit = () => this._emitLiveChange();

        const sectionBloom = makeEl('div', 'options-section');
        sectionBloom.appendChild(makeEl('div', 'options-section-title', 'Sun Bloom'));

        const controls = {
            enabled: makeToggleRow({
                label: 'Enabled',
                value: !!sunBloom.enabled,
                onChange: (v) => { sunBloom.enabled = v; emit(); }
            }),
            mode: makeChoiceRow({
                label: 'Mode',
                value: String(sunBloom.mode ?? 'occlusion'),
                options: [
                    { id: 'occlusion', label: 'Occlusion-aware' },
                    { id: 'selective', label: 'Selective (no occlusion)' }
                ],
                onChange: (v) => { sunBloom.mode = v; emit(); }
            }),
            brightnessOnly: makeToggleRow({
                label: 'Brightness-only',
                value: sunBloom.brightnessOnly !== false,
                onChange: (v) => { sunBloom.brightnessOnly = v; emit(); }
            }),
            strength: makeNumberSliderRow({
                label: 'Strength',
                value: sunBloom.strength ?? 0.9,
                min: 0,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.strength = v; emit(); }
            }),
            radius: makeNumberSliderRow({
                label: 'Radius',
                value: sunBloom.radius ?? 0.25,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.radius = v; emit(); }
            }),
            threshold: makeNumberSliderRow({
                label: 'Threshold (HDR)',
                value: sunBloom.threshold ?? 1.05,
                min: 0,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.threshold = v; emit(); }
            }),
            discRadiusDeg: makeNumberSliderRow({
                label: 'Disc radius (°)',
                value: sunBloom.discRadiusDeg ?? 0.55,
                min: 0.05,
                max: 6,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.discRadiusDeg = v; emit(); }
            }),
            discIntensity: makeNumberSliderRow({
                label: 'Disc intensity',
                value: sunBloom.discIntensity ?? 25,
                min: 0,
                max: 200,
                step: 0.1,
                digits: 1,
                onChange: (v) => { sunBloom.discIntensity = v; emit(); }
            }),
            discFalloff: makeNumberSliderRow({
                label: 'Disc falloff',
                value: sunBloom.discFalloff ?? 2.2,
                min: 0.5,
                max: 10,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.discFalloff = v; emit(); }
            }),
            raysEnabled: makeToggleRow({
                label: 'Rays (starburst)',
                value: !!sunBloom.raysEnabled,
                onChange: (v) => { sunBloom.raysEnabled = v; emit(); }
            }),
            raysIntensity: makeNumberSliderRow({
                label: 'Rays intensity',
                value: sunBloom.raysIntensity ?? 0.85,
                min: 0,
                max: 6,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.raysIntensity = v; emit(); }
            }),
            raysSizePx: makeNumberSliderRow({
                label: 'Rays size (px)',
                value: sunBloom.raysSizePx ?? 950,
                min: 64,
                max: 2400,
                step: 1,
                digits: 0,
                onChange: (v) => { sunBloom.raysSizePx = v; emit(); }
            }),
            raysCount: makeNumberSliderRow({
                label: 'Ray count',
                value: sunBloom.raysCount ?? 48,
                min: 3,
                max: 256,
                step: 1,
                digits: 0,
                onChange: (v) => { sunBloom.raysCount = v; emit(); }
            }),
            raysLength: makeNumberSliderRow({
                label: 'Ray length',
                value: sunBloom.raysLength ?? 0.95,
                min: 0,
                max: 1.6,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.raysLength = v; emit(); }
            }),
            raysLengthJitter: makeNumberSliderRow({
                label: 'Length jitter',
                value: sunBloom.raysLengthJitter ?? 0.45,
                min: 0,
                max: 1.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.raysLengthJitter = v; emit(); }
            }),
            raysBaseWidthDeg: makeNumberSliderRow({
                label: 'Base width (°)',
                value: sunBloom.raysBaseWidthDeg ?? 1.6,
                min: 0,
                max: 12,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.raysBaseWidthDeg = v; emit(); }
            }),
            raysTipWidthDeg: makeNumberSliderRow({
                label: 'Tip width (°)',
                value: sunBloom.raysTipWidthDeg ?? 0.28,
                min: 0,
                max: 12,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.raysTipWidthDeg = v; emit(); }
            }),
            raysSoftnessDeg: makeNumberSliderRow({
                label: 'Softness (°)',
                value: sunBloom.raysSoftnessDeg ?? 0.9,
                min: 0,
                max: 12,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.raysSoftnessDeg = v; emit(); }
            }),
            raysCoreGlow: makeNumberSliderRow({
                label: 'Core glow',
                value: sunBloom.raysCoreGlow ?? 0.35,
                min: 0,
                max: 2.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.raysCoreGlow = v; emit(); }
            }),
            raysOuterGlow: makeNumberSliderRow({
                label: 'Outer glow',
                value: sunBloom.raysOuterGlow ?? 0.18,
                min: 0,
                max: 2.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => { sunBloom.raysOuterGlow = v; emit(); }
            }),
            raysRotationDeg: makeNumberSliderRow({
                label: 'Rays rotation (°)',
                value: sunBloom.raysRotationDeg ?? 0,
                min: -360,
                max: 360,
                step: 1,
                digits: 0,
                onChange: (v) => { sunBloom.raysRotationDeg = v; emit(); }
            })
        };

        sectionBloom.appendChild(controls.enabled.row);
        sectionBloom.appendChild(controls.mode.row);
        sectionBloom.appendChild(controls.brightnessOnly.row);
        sectionBloom.appendChild(controls.strength.row);
        sectionBloom.appendChild(controls.radius.row);
        sectionBloom.appendChild(controls.threshold.row);
        sectionBloom.appendChild(controls.discRadiusDeg.row);
        sectionBloom.appendChild(controls.discIntensity.row);
        sectionBloom.appendChild(controls.discFalloff.row);

        const sectionRays = makeEl('div', 'options-section');
        sectionRays.appendChild(makeEl('div', 'options-section-title', 'Sun Rays (Starburst)'));
        sectionRays.appendChild(controls.raysEnabled.row);
        sectionRays.appendChild(controls.raysIntensity.row);
        sectionRays.appendChild(controls.raysSizePx.row);
        sectionRays.appendChild(controls.raysCount.row);
        sectionRays.appendChild(controls.raysLength.row);
        sectionRays.appendChild(controls.raysLengthJitter.row);
        sectionRays.appendChild(controls.raysBaseWidthDeg.row);
        sectionRays.appendChild(controls.raysTipWidthDeg.row);
        sectionRays.appendChild(controls.raysSoftnessDeg.row);
        sectionRays.appendChild(controls.raysCoreGlow.row);
        sectionRays.appendChild(controls.raysOuterGlow.row);
        sectionRays.appendChild(controls.raysRotationDeg.row);

        const syncEnabled = (enabled) => {
            const off = !enabled;
            controls.mode.setDisabled(off);
            controls.brightnessOnly.toggle.disabled = off;
            for (const ctrl of [controls.strength, controls.radius, controls.threshold, controls.discRadiusDeg, controls.discIntensity, controls.discFalloff]) {
                ctrl.range.disabled = off;
                ctrl.number.disabled = off;
            }
            controls.raysEnabled.toggle.disabled = off;
            for (const ctrl of [
                controls.raysIntensity,
                controls.raysSizePx,
                controls.raysCount,
                controls.raysLength,
                controls.raysLengthJitter,
                controls.raysBaseWidthDeg,
                controls.raysTipWidthDeg,
                controls.raysSoftnessDeg,
                controls.raysCoreGlow,
                controls.raysOuterGlow,
                controls.raysRotationDeg
            ]) {
                ctrl.range.disabled = off || !controls.raysEnabled.toggle.checked;
                ctrl.number.disabled = off || !controls.raysEnabled.toggle.checked;
            }
        };
        syncEnabled(!!sunBloom.enabled);
        controls.enabled.toggle.addEventListener('change', () => syncEnabled(!!controls.enabled.toggle.checked));
        controls.raysEnabled.toggle.addEventListener('change', () => syncEnabled(!!controls.enabled.toggle.checked));

        const note = makeEl('div', 'options-note');
        note.textContent = 'Sun bloom uses a physical emitter mesh so buildings/trees can occlude the glow. Rays are a procedural starburst that follows the sun and respects scene depth.';

        this.body.appendChild(sectionBloom);
        this.body.appendChild(sectionRays);
        this.body.appendChild(note);
    }

    _renderGraphicsTab() {
        this._ensureDraftAntiAliasing();
        this._ensureDraftAmbientOcclusion();
        this._ensureDraftShadows();
        const aa = this._draftAntiAliasing;
        const ao = this._draftAmbientOcclusion;
        const shadows = this._draftShadows;
        const emit = () => this._emitLiveChange();

        const info = this._getAntiAliasingDebugInfo?.() ?? null;
        const msaaSupported = info?.msaaSupported !== undefined ? !!info.msaaSupported : true;
        const msaaMaxSamples = Number.isFinite(info?.msaaMaxSamples) ? Number(info.msaaMaxSamples) : 0;

        const sectionStatus = makeEl('div', 'options-section');
        sectionStatus.appendChild(makeEl('div', 'options-section-title', 'Status'));
        const status = {
            pipeline: makeValueRow({ label: 'Pipeline', value: '-' }),
            active: makeValueRow({ label: 'Active AA', value: '-' }),
            native: makeValueRow({ label: 'Native MSAA', value: '-' }),
            msaa: makeValueRow({ label: 'MSAA (pipeline)', value: '-' }),
            ao: makeValueRow({ label: 'AO', value: '-' })
        };
        sectionStatus.appendChild(status.pipeline.row);
        sectionStatus.appendChild(status.active.row);
        sectionStatus.appendChild(status.native.row);
        sectionStatus.appendChild(status.msaa.row);
        sectionStatus.appendChild(status.ao.row);

        this._aaDebugEls = {
            pipeline: status.pipeline.text,
            active: status.active.text,
            native: status.native.text,
            msaa: status.msaa.text
        };

        const updateAoStatus = () => {
            const mode = String(ao?.mode ?? 'off');
            const bits = [];
            bits.push(mode === 'off' ? 'Off' : mode.toUpperCase());
            const staticOn = String(ao?.staticAo?.mode ?? 'off') !== 'off';
            const contactOn = ao?.busContactShadow?.enabled === true;
            if (staticOn) bits.push('Static');
            if (contactOn) bits.push('Bus');
            status.ao.text.textContent = bits.join(' + ');
        };
        updateAoStatus();

        const sectionAa = makeEl('div', 'options-section');
        sectionAa.appendChild(makeEl('div', 'options-section-title', 'Anti-aliasing'));

        const mode = makeChoiceRow({
            label: 'Mode',
            value: aa.mode,
            options: [
                { id: 'off', label: 'Off' },
                { id: 'msaa', label: 'MSAA' },
                { id: 'taa', label: 'TAA' },
                { id: 'smaa', label: 'SMAA' },
                { id: 'fxaa', label: 'FXAA' }
            ],
            onChange: (v) => {
                aa.mode = v;
                emit();
                syncEnabled();
            }
        });

        const msaaSamples = makeChoiceRow({
            label: 'Samples',
            value: String(aa.msaa?.samples ?? 2),
            options: [
                { id: '2', label: '2×' },
                { id: '4', label: '4×' },
                { id: '8', label: '8×' }
            ],
            onChange: (v) => {
                aa.msaa.samples = Number(v);
                emit();
            }
        });

        const msaaNote = makeEl('div', 'options-note');
        msaaNote.textContent = !msaaSupported
            ? 'MSAA is not supported on this device/browser (WebGL2 required).'
            : `MSAA smooths geometry edges in the post-processing pipeline. Higher samples cost GPU time + VRAM. (max ${msaaMaxSamples || '?'})`;

        const TAA_PRESETS = {
            low: { historyStrength: 0.8, jitter: 0.75, sharpen: 0.1, clampStrength: 0.7 },
            medium: { historyStrength: 0.85, jitter: 0.9, sharpen: 0.12, clampStrength: 0.75 },
            high: { historyStrength: 0.9, jitter: 1.0, sharpen: 0.15, clampStrength: 0.8 },
            ultra: { historyStrength: 0.94, jitter: 1.0, sharpen: 0.2, clampStrength: 0.9 }
        };

        const taaPreset = makeSelectRow({
            label: 'TAA preset',
            value: String(aa.taa?.preset ?? 'high'),
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' },
                { id: 'ultra', label: 'Ultra' },
                { id: 'custom', label: 'Custom' }
            ],
            onChange: (v) => {
                aa.taa.preset = v;
                const preset = TAA_PRESETS[v] ?? null;
                if (preset) {
                    aa.taa.historyStrength = preset.historyStrength;
                    aa.taa.jitter = preset.jitter;
                    aa.taa.sharpen = preset.sharpen;
                    aa.taa.clampStrength = preset.clampStrength;
                    taaHistory.range.value = String(preset.historyStrength);
                    taaHistory.number.value = String(preset.historyStrength.toFixed(2));
                    taaJitter.range.value = String(preset.jitter);
                    taaJitter.number.value = String(preset.jitter.toFixed(2));
                    taaSharpen.range.value = String(preset.sharpen);
                    taaSharpen.number.value = String(preset.sharpen.toFixed(2));
                    taaClamp.range.value = String(preset.clampStrength);
                    taaClamp.number.value = String(preset.clampStrength.toFixed(2));
                }
                emit();
            }
        });

        const taaHistory = makeNumberSliderRow({
            label: 'History strength',
            value: aa.taa?.historyStrength ?? 0.9,
            min: 0,
            max: 0.98,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                aa.taa.historyStrength = v;
                aa.taa.preset = 'custom';
                taaPreset.select.value = 'custom';
                emit();
            }
        });

        const taaJitter = makeNumberSliderRow({
            label: 'Jitter amount',
            value: aa.taa?.jitter ?? 1.0,
            min: 0,
            max: 1,
            step: 0.05,
            digits: 2,
            onChange: (v) => {
                aa.taa.jitter = v;
                aa.taa.preset = 'custom';
                taaPreset.select.value = 'custom';
                emit();
            }
        });

        const taaSharpen = makeNumberSliderRow({
            label: 'Sharpen',
            value: aa.taa?.sharpen ?? 0.15,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                aa.taa.sharpen = v;
                aa.taa.preset = 'custom';
                taaPreset.select.value = 'custom';
                emit();
            }
        });

        const taaClamp = makeNumberSliderRow({
            label: 'Ghosting clamp',
            value: aa.taa?.clampStrength ?? 0.8,
            min: 0,
            max: 1,
            step: 0.05,
            digits: 2,
            onChange: (v) => {
                aa.taa.clampStrength = v;
                aa.taa.preset = 'custom';
                taaPreset.select.value = 'custom';
                emit();
            }
        });

        const taaNote = makeEl('div', 'options-note');
        taaNote.textContent = 'TAA accumulates previous frames for smoother thin details. Higher history increases stability but can ghost on motion. Use clamp + lower history to reduce trails.';

        const SMAA_PRESETS = {
            low: { threshold: 0.15, maxSearchSteps: 8, maxSearchStepsDiag: 4, cornerRounding: 25 },
            medium: { threshold: 0.1, maxSearchSteps: 16, maxSearchStepsDiag: 8, cornerRounding: 25 },
            high: { threshold: 0.075, maxSearchSteps: 24, maxSearchStepsDiag: 12, cornerRounding: 25 },
            ultra: { threshold: 0.05, maxSearchSteps: 32, maxSearchStepsDiag: 16, cornerRounding: 25 }
        };

        const smaaPreset = makeSelectRow({
            label: 'SMAA preset',
            value: String(aa.smaa?.preset ?? 'medium'),
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' },
                { id: 'ultra', label: 'Ultra' },
                { id: 'custom', label: 'Custom' }
            ],
            onChange: (v) => {
                aa.smaa.preset = v;
                const preset = SMAA_PRESETS[v] ?? null;
                if (preset) {
                    aa.smaa.threshold = preset.threshold;
                    aa.smaa.maxSearchSteps = preset.maxSearchSteps;
                    aa.smaa.maxSearchStepsDiag = preset.maxSearchStepsDiag;
                    aa.smaa.cornerRounding = preset.cornerRounding;
                    smaaThreshold.range.value = String(preset.threshold);
                    smaaThreshold.number.value = String(preset.threshold.toFixed(2));
                    smaaSearch.range.value = String(preset.maxSearchSteps);
                    smaaSearch.number.value = String(preset.maxSearchSteps);
                    smaaSearchDiag.range.value = String(preset.maxSearchStepsDiag);
                    smaaSearchDiag.number.value = String(preset.maxSearchStepsDiag);
                    smaaCorner.range.value = String(preset.cornerRounding);
                    smaaCorner.number.value = String(preset.cornerRounding);
                }
                emit();
            }
        });

        const smaaThreshold = makeNumberSliderRow({
            label: 'SMAA threshold',
            value: aa.smaa?.threshold ?? 0.1,
            min: 0.02,
            max: 0.2,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                aa.smaa.threshold = v;
                aa.smaa.preset = 'custom';
                smaaPreset.select.value = 'custom';
                emit();
            }
        });

        const smaaSearch = makeNumberSliderRow({
            label: 'SMAA search steps',
            value: aa.smaa?.maxSearchSteps ?? 16,
            min: 4,
            max: 32,
            step: 1,
            digits: 0,
            onChange: (v) => {
                aa.smaa.maxSearchSteps = Math.round(v);
                aa.smaa.preset = 'custom';
                smaaPreset.select.value = 'custom';
                emit();
            }
        });

        const smaaSearchDiag = makeNumberSliderRow({
            label: 'SMAA diag steps',
            value: aa.smaa?.maxSearchStepsDiag ?? 8,
            min: 0,
            max: 16,
            step: 1,
            digits: 0,
            onChange: (v) => {
                aa.smaa.maxSearchStepsDiag = Math.round(v);
                aa.smaa.preset = 'custom';
                smaaPreset.select.value = 'custom';
                emit();
            }
        });

        const smaaCorner = makeNumberSliderRow({
            label: 'SMAA corner rounding',
            value: aa.smaa?.cornerRounding ?? 25,
            min: 0,
            max: 100,
            step: 1,
            digits: 0,
            onChange: (v) => {
                aa.smaa.cornerRounding = Math.round(v);
                aa.smaa.preset = 'custom';
                smaaPreset.select.value = 'custom';
                emit();
            }
        });

        const FXAA_PRESETS = {
            sharp: { edgeThreshold: 0.28 },
            balanced: { edgeThreshold: 0.2 },
            soft: { edgeThreshold: 0.12 }
        };

        const fxaaPreset = makeSelectRow({
            label: 'FXAA preset',
            value: String(aa.fxaa?.preset ?? 'balanced'),
            options: [
                { id: 'sharp', label: 'Sharp' },
                { id: 'balanced', label: 'Balanced' },
                { id: 'soft', label: 'Soft' },
                { id: 'custom', label: 'Custom' }
            ],
            onChange: (v) => {
                aa.fxaa.preset = v;
                const preset = FXAA_PRESETS[v] ?? null;
                if (preset) {
                    aa.fxaa.edgeThreshold = preset.edgeThreshold;
                    fxaaThreshold.range.value = String(preset.edgeThreshold);
                    fxaaThreshold.number.value = String(preset.edgeThreshold.toFixed(2));
                }
                emit();
            }
        });

        const fxaaThreshold = makeNumberSliderRow({
            label: 'FXAA edge threshold',
            value: aa.fxaa?.edgeThreshold ?? 0.2,
            min: 0.05,
            max: 0.35,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                aa.fxaa.edgeThreshold = v;
                aa.fxaa.preset = 'custom';
                fxaaPreset.select.value = 'custom';
                emit();
            }
        });

        const smaaNote = makeEl('div', 'options-note');
        smaaNote.textContent = 'SMAA is a high quality post-process AA. Lower threshold detects more edges (smoother, slightly blurrier).';

        const fxaaNote = makeEl('div', 'options-note');
        fxaaNote.textContent = 'FXAA is a fast post-process AA. Higher threshold keeps more detail but reduces smoothing.';

        const msaaSection = makeEl('div');
        msaaSection.appendChild(makeEl('div', 'options-section-title', 'MSAA'));
        msaaSection.appendChild(msaaSamples.row);
        msaaSection.appendChild(msaaNote);

        const taaSection = makeEl('div');
        taaSection.appendChild(makeEl('div', 'options-section-title', 'TAA'));
        taaSection.appendChild(taaPreset.row);
        taaSection.appendChild(taaHistory.row);
        taaSection.appendChild(taaJitter.row);
        taaSection.appendChild(taaSharpen.row);
        taaSection.appendChild(taaClamp.row);
        taaSection.appendChild(taaNote);

        const smaaSection = makeEl('div');
        smaaSection.appendChild(makeEl('div', 'options-section-title', 'SMAA'));
        smaaSection.appendChild(smaaPreset.row);
        smaaSection.appendChild(smaaThreshold.row);
        smaaSection.appendChild(smaaSearch.row);
        smaaSection.appendChild(smaaSearchDiag.row);
        smaaSection.appendChild(smaaCorner.row);
        smaaSection.appendChild(smaaNote);

        const fxaaSection = makeEl('div');
        fxaaSection.appendChild(makeEl('div', 'options-section-title', 'FXAA'));
        fxaaSection.appendChild(fxaaPreset.row);
        fxaaSection.appendChild(fxaaThreshold.row);
        fxaaSection.appendChild(fxaaNote);

        const syncEnabled = () => {
            const current = String(aa.mode ?? 'off');
            if (!msaaSupported && current === 'msaa') {
                aa.mode = 'off';
                mode.setValue('off');
                emit();
            }

            const msaaActive = current === 'msaa' && msaaSupported;
            const taaActive = current === 'taa';
            const smaaActive = current === 'smaa';
            const fxaaActive = current === 'fxaa';

            msaaSection.classList.toggle('hidden', !msaaActive);
            taaSection.classList.toggle('hidden', !taaActive);
            smaaSection.classList.toggle('hidden', !smaaActive);
            fxaaSection.classList.toggle('hidden', !fxaaActive);

            const max = msaaMaxSamples > 0 ? msaaMaxSamples : 8;
            const allow2 = msaaSupported && max >= 2;
            const allow4 = msaaSupported && max >= 4;
            const allow8 = msaaSupported && max >= 8;
            msaaSamples.setDisabled(!msaaActive);
            const btn2 = msaaSamples.getButton('2');
            const btn4 = msaaSamples.getButton('4');
            const btn8 = msaaSamples.getButton('8');
            if (btn2) btn2.disabled = !msaaActive || !allow2;
            if (btn4) btn4.disabled = !msaaActive || !allow4;
            if (btn8) btn8.disabled = !msaaActive || !allow8;
            if (msaaActive) {
                if (allow8 && aa.msaa.samples > 8) aa.msaa.samples = 8;
                else if (!allow8 && allow4 && aa.msaa.samples > 4) aa.msaa.samples = 4;
                else if (!allow4 && allow2 && aa.msaa.samples > 2) aa.msaa.samples = 2;
                if (!allow2) aa.msaa.samples = 0;
                    msaaSamples.setValue(String(aa.msaa.samples));
            }

            taaPreset.select.disabled = !taaActive;
            for (const row of [taaHistory, taaJitter, taaSharpen, taaClamp]) {
                row.range.disabled = !taaActive;
                row.number.disabled = !taaActive;
            }

            smaaPreset.select.disabled = !smaaActive;
            fxaaPreset.select.disabled = !fxaaActive;

            for (const row of [smaaThreshold, smaaSearch, smaaSearchDiag, smaaCorner]) {
                row.range.disabled = !smaaActive;
                row.number.disabled = !smaaActive;
            }
            fxaaThreshold.range.disabled = !fxaaActive;
            fxaaThreshold.number.disabled = !fxaaActive;
        };

        const msaaBtn = mode.getButton('msaa');
        if (msaaBtn) msaaBtn.disabled = !msaaSupported;

        sectionAa.appendChild(mode.row);
        sectionAa.appendChild(msaaSection);
        sectionAa.appendChild(taaSection);
        sectionAa.appendChild(smaaSection);
        sectionAa.appendChild(fxaaSection);

        syncEnabled();

        const sectionShadows = makeEl('div', 'options-section');
        sectionShadows.appendChild(makeEl('div', 'options-section-title', 'Shadows'));

        const shadowQuality = makeChoiceRow({
            label: 'Shadow quality',
            value: String(shadows?.quality ?? 'medium'),
            options: [
                { id: 'off', label: 'Off' },
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' },
                { id: 'ultra', label: 'Ultra' }
            ],
            onChange: (v) => {
                shadows.quality = v;
                emit();
            }
        });

        const shadowNote = makeEl('div', 'options-note');
        shadowNote.textContent = 'Applied immediately. Higher presets increase GPU cost and VRAM usage.';

        sectionShadows.appendChild(shadowQuality.row);
        sectionShadows.appendChild(shadowNote);

        const sectionAo = makeEl('div', 'options-section');
        sectionAo.appendChild(makeEl('div', 'options-section-title', 'Ambient Occlusion'));

	        const aoMode = makeChoiceRow({
	            label: 'Mode',
	            value: String(ao?.mode ?? 'off'),
	            options: [
	                { id: 'off', label: 'Off' },
	                { id: 'ssao', label: 'SSAO' },
	                { id: 'gtao', label: 'GTAO' }
	            ],
	            onChange: (v) => {
	                ao.mode = v;
	                emit();
	                syncAoControls();
	                updateAoStatus();
	            }
	        });

	        const staticAoMode = makeChoiceRow({
	            label: 'Static AO',
	            value: String(ao?.staticAo?.mode ?? 'off') === 'off' ? 'off' : 'vertex',
	            options: [
	                { id: 'off', label: 'Off' },
	                { id: 'vertex', label: 'On' }
	            ],
	            onChange: (v) => {
	                if (!ao.staticAo || typeof ao.staticAo !== 'object') ao.staticAo = {};
	                ao.staticAo.mode = v === 'off' ? 'off' : 'vertex';
	                emit();
	                syncAoControls();
	                updateAoStatus();
	            }
	        });

        const staticAoIntensity = makeNumberSliderRow({
            label: 'Static AO intensity',
            value: ao?.staticAo?.intensity ?? 0.6,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { ao.staticAo.intensity = v; emit(); }
        });

        const staticAoQuality = makeChoiceRow({
            label: 'Static AO quality',
            value: String(ao?.staticAo?.quality ?? 'medium'),
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' }
            ],
            onChange: (v) => { ao.staticAo.quality = v; emit(); }
        });

        const staticAoRadius = makeNumberSliderRow({
            label: 'Static AO radius (m)',
            value: ao?.staticAo?.radius ?? 4,
            min: 0.25,
            max: 16,
            step: 0.05,
            digits: 2,
            onChange: (v) => { ao.staticAo.radius = v; emit(); }
        });

        const staticAoWallHeight = makeNumberSliderRow({
            label: 'Static AO wall height (m)',
            value: ao?.staticAo?.wallHeight ?? 1.6,
            min: 0.25,
            max: 6,
            step: 0.05,
            digits: 2,
            onChange: (v) => { ao.staticAo.wallHeight = v; emit(); }
        });

        const staticAoDebugView = makeToggleRow({
            label: 'Static AO debug view',
            value: ao?.staticAo?.debugView === true,
            onChange: (v) => { ao.staticAo.debugView = v; emit(); }
        });

        const aoAlphaHandling = makeChoiceRow({
            label: 'Alpha handling',
            value: String(ao?.alpha?.handling ?? 'alpha_test'),
            options: [
                { id: 'alpha_test', label: 'Alpha test' },
                { id: 'exclude', label: 'Exclude' }
            ],
            onChange: (v) => {
                if (!ao.alpha || typeof ao.alpha !== 'object') ao.alpha = {};
                ao.alpha.handling = v;
                emit();
                syncAoControls();
            }
        });

	        const aoAlphaThreshold = makeNumberSliderRow({
	            label: 'Alpha threshold',
	            value: ao?.alpha?.threshold ?? 0.5,
            min: 0.01,
            max: 0.99,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                if (!ao.alpha || typeof ao.alpha !== 'object') ao.alpha = {};
                ao.alpha.threshold = v;
                emit();
	            }
	        });

	        const busContactShadowMode = makeChoiceRow({
	            label: 'Bus contact shadow',
	            value: ao?.busContactShadow?.enabled === true ? 'on' : 'off',
	            options: [
	                { id: 'off', label: 'Off' },
	                { id: 'on', label: 'On' }
	            ],
	            onChange: (v) => {
	                if (!ao.busContactShadow || typeof ao.busContactShadow !== 'object') ao.busContactShadow = {};
	                ao.busContactShadow.enabled = v === 'on';
	                emit();
	                syncAoControls();
	                updateAoStatus();
	            }
	        });

        const busContactShadowIntensity = makeNumberSliderRow({
            label: 'Bus contact shadow intensity',
            value: ao?.busContactShadow?.intensity ?? 0.4,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { ao.busContactShadow.intensity = v; emit(); }
        });

        const busContactShadowRadius = makeNumberSliderRow({
            label: 'Bus contact shadow radius (m)',
            value: ao?.busContactShadow?.radius ?? 0.9,
            min: 0.05,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => { ao.busContactShadow.radius = v; emit(); }
        });

        const busContactShadowSoftness = makeNumberSliderRow({
            label: 'Bus contact shadow softness',
            value: ao?.busContactShadow?.softness ?? 0.75,
            min: 0.02,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { ao.busContactShadow.softness = v; emit(); }
        });

        const busContactShadowMaxDistance = makeNumberSliderRow({
            label: 'Bus contact shadow max distance (m)',
            value: ao?.busContactShadow?.maxDistance ?? 0.75,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { ao.busContactShadow.maxDistance = v; emit(); }
        });

        const ssaoIntensity = makeNumberSliderRow({
            label: 'SSAO intensity',
            value: ao?.ssao?.intensity ?? 0.35,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { ao.ssao.intensity = v; emit(); }
        });

        const ssaoRadius = makeNumberSliderRow({
            label: 'SSAO radius',
            value: ao?.ssao?.radius ?? 8,
            min: 0.1,
            max: 64,
            step: 0.1,
            digits: 1,
            onChange: (v) => { ao.ssao.radius = v; emit(); }
        });

        const ssaoQuality = makeChoiceRow({
            label: 'SSAO quality',
            value: String(ao?.ssao?.quality ?? 'medium'),
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' }
            ],
            onChange: (v) => { ao.ssao.quality = v; emit(); }
        });

        const gtaoIntensity = makeNumberSliderRow({
            label: 'GTAO intensity',
            value: ao?.gtao?.intensity ?? 0.35,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { ao.gtao.intensity = v; emit(); }
        });

        const gtaoRadius = makeNumberSliderRow({
            label: 'GTAO radius',
            value: ao?.gtao?.radius ?? 0.25,
            min: 0.05,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (v) => { ao.gtao.radius = v; emit(); }
        });

        const gtaoQuality = makeChoiceRow({
            label: 'GTAO quality',
            value: String(ao?.gtao?.quality ?? 'medium'),
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' }
            ],
            onChange: (v) => { ao.gtao.quality = v; emit(); }
        });

        const gtaoDenoise = makeToggleRow({
            label: 'GTAO denoise',
            value: ao?.gtao?.denoise !== false,
            onChange: (v) => { ao.gtao.denoise = v; emit(); }
        });

        const gtaoUpdateMode = makeSelectRow({
            label: 'GTAO update',
            value: String(ao?.gtao?.updateMode ?? 'every_frame'),
            options: [
                { id: 'every_frame', label: 'Every frame' },
                { id: 'when_camera_moves', label: 'When camera moves' },
                { id: 'half_rate', label: 'Half rate (2 frames)' },
                { id: 'third_rate', label: 'Third rate (3 frames)' },
                { id: 'quarter_rate', label: 'Quarter rate (4 frames)' }
            ],
            onChange: (v) => {
                ao.gtao.updateMode = v;
                emit();
                syncAoControls();
            }
        });

        const gtaoMotionPos = makeNumberSliderRow({
            label: 'GTAO motion threshold: position (m)',
            value: ao?.gtao?.motionThreshold?.positionMeters ?? 0.02,
            min: 0,
            max: 0.25,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                if (!ao.gtao.motionThreshold || typeof ao.gtao.motionThreshold !== 'object') ao.gtao.motionThreshold = {};
                ao.gtao.motionThreshold.positionMeters = v;
                emit();
            }
        });

        const gtaoMotionRot = makeNumberSliderRow({
            label: 'GTAO motion threshold: rotation (deg)',
            value: ao?.gtao?.motionThreshold?.rotationDeg ?? 0.15,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                if (!ao.gtao.motionThreshold || typeof ao.gtao.motionThreshold !== 'object') ao.gtao.motionThreshold = {};
                ao.gtao.motionThreshold.rotationDeg = v;
                emit();
            }
        });

        const gtaoMotionFov = makeNumberSliderRow({
            label: 'GTAO motion threshold: FOV (deg)',
            value: ao?.gtao?.motionThreshold?.fovDeg ?? 0,
            min: 0,
            max: 10,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                if (!ao.gtao.motionThreshold || typeof ao.gtao.motionThreshold !== 'object') ao.gtao.motionThreshold = {};
                ao.gtao.motionThreshold.fovDeg = v;
                emit();
            }
        });

        const aoNote = makeEl('div', 'options-note');
        aoNote.textContent = 'Static AO is a baked, stable occlusion term for static world geometry. SSAO is cheaper; GTAO is cleaner and can be denoised. Bus contact shadow is a cheap grounding cue for the vehicle.';

        sectionAo.appendChild(aoMode.row);
        const aoParamsStack = makeEl('div', 'options-overlap-stack');
        const ssaoGroup = makeEl('div', 'options-overlap-pane');
        ssaoGroup.appendChild(ssaoIntensity.row);
        ssaoGroup.appendChild(ssaoRadius.row);
        ssaoGroup.appendChild(ssaoQuality.row);

        const gtaoGroup = makeEl('div', 'options-overlap-pane');
        gtaoGroup.appendChild(gtaoIntensity.row);
        gtaoGroup.appendChild(gtaoRadius.row);
        gtaoGroup.appendChild(gtaoQuality.row);
        gtaoGroup.appendChild(gtaoDenoise.row);
        gtaoGroup.appendChild(gtaoUpdateMode.row);
        gtaoGroup.appendChild(gtaoMotionPos.row);
        gtaoGroup.appendChild(gtaoMotionRot.row);
        gtaoGroup.appendChild(gtaoMotionFov.row);

	        aoParamsStack.appendChild(ssaoGroup);
	        aoParamsStack.appendChild(gtaoGroup);
	        sectionAo.appendChild(aoParamsStack);
	        sectionAo.appendChild(aoAlphaHandling.row);
	        sectionAo.appendChild(aoAlphaThreshold.row);
	        sectionAo.appendChild(staticAoMode.row);
	        const staticAoGroup = makeEl('div', 'options-overlap-pane');
	        staticAoGroup.appendChild(staticAoIntensity.row);
	        staticAoGroup.appendChild(staticAoQuality.row);
	        staticAoGroup.appendChild(staticAoRadius.row);
	        staticAoGroup.appendChild(staticAoWallHeight.row);
	        staticAoGroup.appendChild(staticAoDebugView.row);
	        sectionAo.appendChild(staticAoGroup);

	        sectionAo.appendChild(busContactShadowMode.row);
	        const busContactShadowGroup = makeEl('div', 'options-overlap-pane');
	        busContactShadowGroup.appendChild(busContactShadowIntensity.row);
	        busContactShadowGroup.appendChild(busContactShadowRadius.row);
	        busContactShadowGroup.appendChild(busContactShadowSoftness.row);
	        busContactShadowGroup.appendChild(busContactShadowMaxDistance.row);
	        sectionAo.appendChild(busContactShadowGroup);
	        sectionAo.appendChild(aoNote);

	        const syncAoControls = () => {
	            const mode = String(ao?.mode ?? 'off');
	            const ssaoOn = mode === 'ssao';
	            const gtaoOn = mode === 'gtao';
	            const aoOn = ssaoOn || gtaoOn;
	            const alphaHandling = String(ao?.alpha?.handling ?? 'alpha_test');
	            const alphaTestOn = alphaHandling === 'alpha_test';

	            const staticMode = String(ao?.staticAo?.mode ?? 'off');
	            const staticOn = staticMode !== 'off';

	            staticAoMode.setValue(staticOn ? 'vertex' : 'off');
	            staticAoGroup.classList.toggle('hidden', !staticOn);
	            for (const ctrl of [staticAoIntensity, staticAoRadius, staticAoWallHeight]) {
	                ctrl.range.disabled = !staticOn;
	                ctrl.number.disabled = !staticOn;
	            }
	            staticAoQuality.setDisabled(!staticOn);
	            staticAoDebugView.toggle.disabled = !staticOn;

            aoParamsStack.classList.toggle('hidden', !aoOn);
            ssaoGroup.classList.toggle('hidden', !ssaoOn);
            gtaoGroup.classList.toggle('hidden', !gtaoOn);

            for (const ctrl of [ssaoIntensity, ssaoRadius]) {
                ctrl.range.disabled = !ssaoOn;
                ctrl.number.disabled = !ssaoOn;
            }
            ssaoQuality.setDisabled(!ssaoOn);

            for (const ctrl of [gtaoIntensity, gtaoRadius]) {
                ctrl.range.disabled = !gtaoOn;
                ctrl.number.disabled = !gtaoOn;
            }
            gtaoQuality.setDisabled(!gtaoOn);
            gtaoDenoise.toggle.disabled = !gtaoOn;
            gtaoUpdateMode.select.disabled = !gtaoOn;

            const updateMode = String(ao?.gtao?.updateMode ?? 'every_frame');
            const motionOn = gtaoOn && updateMode === 'when_camera_moves';
            for (const ctrl of [gtaoMotionPos, gtaoMotionRot, gtaoMotionFov]) {
                ctrl.row.classList.toggle('hidden', !motionOn);
                ctrl.range.disabled = !motionOn;
                ctrl.number.disabled = !motionOn;
            }

            aoAlphaHandling.setDisabled(!aoOn);
            aoAlphaHandling.row.classList.toggle('hidden', !aoOn);

            aoAlphaThreshold.row.classList.toggle('hidden', !(aoOn && alphaTestOn));
	            aoAlphaThreshold.range.disabled = !aoOn || !alphaTestOn;
	            aoAlphaThreshold.number.disabled = !aoOn || !alphaTestOn;

	            const contactShadowOn = ao?.busContactShadow?.enabled === true;
	            busContactShadowMode.setValue(contactShadowOn ? 'on' : 'off');
	            busContactShadowGroup.classList.toggle('hidden', !contactShadowOn);
	            for (const ctrl of [busContactShadowIntensity, busContactShadowRadius, busContactShadowSoftness, busContactShadowMaxDistance]) {
	                ctrl.range.disabled = !contactShadowOn;
	                ctrl.number.disabled = !contactShadowOn;
	            }
	        };
	        syncAoControls();

	        this.body.appendChild(sectionStatus);
	        this.body.appendChild(sectionAa);
	        this.body.appendChild(sectionShadows);
	        this.body.appendChild(sectionAo);
	        this._refreshAntiAliasingDebug();
	    }

    _renderDebugTab() {
        this._ensureDraftVehicleMotionDebug();
        const dbg = this._draftVehicleMotionDebug;
        const logGate = dbg.logGate ?? (dbg.logGate = {});
        const camera = dbg.camera ?? (dbg.camera = {});
        const backStep = dbg.backStep ?? (dbg.backStep = {});
        const cameraCatchup = dbg.cameraCatchup ?? (dbg.cameraCatchup = {});
        const cameraLag = dbg.cameraLag ?? (dbg.cameraLag = {});
        const cameraTargetMismatch = dbg.cameraTargetMismatch ?? (dbg.cameraTargetMismatch = {});
        const spike = dbg.spike ?? (dbg.spike = {});
        const syntheticDt = dbg.syntheticDt ?? (dbg.syntheticDt = {});
        const emit = () => this._emitLiveChange();

        const sectionVehicle = makeEl('div', 'options-section');
        sectionVehicle.appendChild(makeEl('div', 'options-section-title', 'Vehicle motion'));

        const controls = {
            freezeCamera: makeToggleRow({
                label: 'Freeze camera (debug)',
                value: camera.freeze === true,
                onChange: (v) => { camera.freeze = v; emit(); }
            }),
            enabled: makeToggleRow({
                label: 'Enable vehicle motion debug',
                value: dbg.enabled,
                onChange: (v) => { dbg.enabled = v; emit(); }
            }),
            overlay: makeToggleRow({
                label: 'Overlay',
                value: dbg.overlay !== false,
                onChange: (v) => { dbg.overlay = v; emit(); }
            }),
            logSpikes: makeToggleRow({
                label: 'Console log backsteps',
                value: dbg.logSpikes === true,
                onChange: (v) => { dbg.logSpikes = v; emit(); }
            }),
            logCatchup: makeToggleRow({
                label: 'Console log camera catch-up',
                value: dbg.logCameraCatchup === true,
                onChange: (v) => { dbg.logCameraCatchup = v; emit(); }
            }),
            logLag: makeToggleRow({
                label: 'Console log camera lag',
                value: dbg.logCameraLag === true,
                onChange: (v) => { dbg.logCameraLag = v; emit(); }
            }),
            logCameraEvents: makeToggleRow({
                label: 'Console log camera events',
                value: dbg.logCameraEvents === true,
                onChange: (v) => { dbg.logCameraEvents = v; emit(); }
            }),
            logCameraTargetMismatch: makeToggleRow({
                label: 'Console log camera target mismatch',
                value: dbg.logCameraTargetMismatch === true,
                onChange: (v) => { dbg.logCameraTargetMismatch = v; emit(); }
            }),
            logMinScreenPx: makeNumberSliderRow({
                label: 'Log gate: min bus screen delta (px)',
                value: logGate.minScreenPx ?? 3,
                min: 0,
                max: 100,
                step: 1,
                digits: 0,
                onChange: (v) => { logGate.minScreenPx = v; emit(); }
            }),
            backStep: makeNumberSliderRow({
                label: 'Backstep threshold: proj (m)',
                value: backStep.minProjMeters ?? 0.05,
                min: 0,
                max: 2,
                step: 0.01,
                digits: 2,
                onChange: (v) => { backStep.minProjMeters = v; emit(); }
            }),
            catchupDfwd: makeNumberSliderRow({
                label: 'Catch-up threshold: cam→bus dfwd (m)',
                value: cameraCatchup.minDfwdMeters ?? 0.05,
                min: 0,
                max: 2,
                step: 0.01,
                digits: 2,
                onChange: (v) => { cameraCatchup.minDfwdMeters = v; emit(); }
            }),
            catchupCamMove: makeNumberSliderRow({
                label: 'Catch-up min camera move (m)',
                value: cameraCatchup.minCameraMoveMeters ?? 0.01,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { cameraCatchup.minCameraMoveMeters = v; emit(); }
            }),
            catchupDistDrop: makeNumberSliderRow({
                label: 'Catch-up threshold: cam↔bus dist drop (m)',
                value: cameraCatchup.minCamBusDistDropMeters ?? 0.05,
                min: 0,
                max: 2,
                step: 0.01,
                digits: 2,
                onChange: (v) => { cameraCatchup.minCamBusDistDropMeters = v; emit(); }
            }),
            lagBusStep: makeNumberSliderRow({
                label: 'Lag threshold: bus step (m)',
                value: cameraLag.minBusStepMeters ?? 0.2,
                min: 0,
                max: 2,
                step: 0.01,
                digits: 2,
                onChange: (v) => { cameraLag.minBusStepMeters = v; emit(); }
            }),
            lagRatio: makeNumberSliderRow({
                label: 'Lag threshold: cam/bus step ratio',
                value: cameraLag.maxCamStepRatio ?? 0.55,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { cameraLag.maxCamStepRatio = v; emit(); }
            }),
            targetMatrixErr: makeNumberSliderRow({
                label: 'Target mismatch threshold: anchor matrix err (m)',
                value: cameraTargetMismatch.minAnchorMatrixErrMeters ?? 0.02,
                min: 0,
                max: 2,
                step: 0.01,
                digits: 2,
                onChange: (v) => { cameraTargetMismatch.minAnchorMatrixErrMeters = v; emit(); }
            }),
            maxDist: makeNumberSliderRow({
                label: 'Spike threshold: dist (m)',
                value: spike.maxDistMeters ?? 0.9,
                min: 0.05,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { spike.maxDistMeters = v; emit(); }
            }),
            maxYaw: makeNumberSliderRow({
                label: 'Spike threshold: yaw (deg)',
                value: spike.maxYawDeg ?? 25,
                min: 1,
                max: 180,
                step: 1,
                digits: 0,
                onChange: (v) => { spike.maxYawDeg = v; emit(); }
            }),
            maxScreen: makeNumberSliderRow({
                label: 'Spike threshold: screen (px)',
                value: spike.maxScreenPx ?? 18,
                min: 1,
                max: 300,
                step: 1,
                digits: 0,
                onChange: (v) => { spike.maxScreenPx = v; emit(); }
            }),
            syntheticEnabled: makeToggleRow({
                label: 'Synthetic low/uneven FPS (dt forcing)',
                value: syntheticDt.enabled === true,
                onChange: (v) => {
                    syntheticDt.enabled = v;
                    if (v && (!syntheticDt.pattern || syntheticDt.pattern === 'off')) syntheticDt.pattern = 'alt60_20';
                    if (!v) syntheticDt.pattern = syntheticDt.pattern ?? 'off';
                    emit();
                    syncSynthetic();
                }
            }),
            syntheticMode: makeSelectRow({
                label: 'Synthetic mode',
                value: String(syntheticDt.mode ?? 'dt'),
                options: [
                    { id: 'stall', label: 'Stall (real dt spikes, real-time)' },
                    { id: 'dt', label: 'Force dt (changes sim speed)' }
                ],
                onChange: (v) => { syntheticDt.mode = v; emit(); }
            }),
            syntheticStallMs: makeNumberSliderRow({
                label: 'Stall ms (when pattern stalls)',
                value: syntheticDt.stallMs ?? 34,
                min: 0,
                max: 120,
                step: 1,
                digits: 0,
                onChange: (v) => { syntheticDt.stallMs = v; emit(); }
            }),
            syntheticPattern: makeSelectRow({
                label: 'Synthetic dt pattern',
                value: String(syntheticDt.pattern ?? 'off'),
                options: [
                    { id: 'off', label: 'Off' },
                    { id: 'steady20', label: 'Steady 20 FPS (dt=0.05)' },
                    { id: 'steady30', label: 'Steady 30 FPS (dt=1/30)' },
                    { id: 'alt60_20', label: 'Alternate 60/20 FPS' },
                    { id: 'alt60_30', label: 'Alternate 60/30 FPS' },
                    { id: 'alt60_40', label: 'Alternate 60/40 FPS' },
                    { id: 'spike20', label: 'Mostly 60 FPS, spike 20 FPS' }
                ],
                onChange: (v) => {
                    syntheticDt.pattern = v;
                    syntheticDt.enabled = v !== 'off';
                    emit();
                    syncSynthetic();
                }
            })
        };

        const syncSynthetic = () => {
            const on = dbg.enabled === true && syntheticDt.enabled === true;
            controls.syntheticPattern.select.disabled = !on;
            controls.syntheticMode.select.disabled = !on;
            controls.syntheticStallMs.range.disabled = !on;
            controls.syntheticStallMs.number.disabled = !on;
        };
        syncSynthetic();
        controls.enabled.toggle.addEventListener('change', () => syncSynthetic());

        sectionVehicle.appendChild(controls.enabled.row);
        sectionVehicle.appendChild(controls.freezeCamera.row);
        sectionVehicle.appendChild(controls.overlay.row);
        sectionVehicle.appendChild(controls.logSpikes.row);
        sectionVehicle.appendChild(controls.logCatchup.row);
        sectionVehicle.appendChild(controls.logLag.row);
        sectionVehicle.appendChild(controls.logCameraEvents.row);
        sectionVehicle.appendChild(controls.logCameraTargetMismatch.row);
        sectionVehicle.appendChild(controls.logMinScreenPx.row);
        sectionVehicle.appendChild(controls.backStep.row);
        sectionVehicle.appendChild(controls.catchupDfwd.row);
        sectionVehicle.appendChild(controls.catchupCamMove.row);
        sectionVehicle.appendChild(controls.catchupDistDrop.row);
        sectionVehicle.appendChild(controls.lagBusStep.row);
        sectionVehicle.appendChild(controls.lagRatio.row);
        sectionVehicle.appendChild(controls.targetMatrixErr.row);
        sectionVehicle.appendChild(controls.maxDist.row);
        sectionVehicle.appendChild(controls.maxYaw.row);
        sectionVehicle.appendChild(controls.maxScreen.row);
        sectionVehicle.appendChild(controls.syntheticEnabled.row);
        sectionVehicle.appendChild(controls.syntheticMode.row);
        sectionVehicle.appendChild(controls.syntheticStallMs.row);
        sectionVehicle.appendChild(controls.syntheticPattern.row);

        const sectionReadouts = makeEl('div', 'options-section');
        sectionReadouts.appendChild(makeEl('div', 'options-section-title', 'Readouts'));
        const r = {
            dt: makeValueRow({ label: 'Render dt', value: '-' }),
            fps: makeValueRow({ label: 'Estimated FPS', value: '-' }),
            rawDt: makeValueRow({ label: 'Raw dt (pre-clamp)', value: '-' }),
            synthetic: makeValueRow({ label: 'Synthetic dt pattern', value: '-' }),
            fixedDt: makeValueRow({ label: 'Physics fixedDt', value: '-' }),
            subSteps: makeValueRow({ label: 'Physics substeps', value: '-' }),
            alpha: makeValueRow({ label: 'Physics alpha', value: '-' }),
            anchorPos: makeValueRow({ label: 'Bus anchor (world)', value: '-' }),
            anchorYaw: makeValueRow({ label: 'Bus yaw (world)', value: '-' }),
            locoPos: makeValueRow({ label: 'Physics locomotion pos', value: '-' }),
            locoSpeed: makeValueRow({ label: 'Physics speed', value: '-' }),
            posErr: makeValueRow({ label: 'Render vs physics posErr', value: '-' }),
            yawErr: makeValueRow({ label: 'Render vs physics yawErr', value: '-' }),
            screenPos: makeValueRow({ label: 'Bus screen pos (px)', value: '-' })
        };
        for (const row of Object.values(r)) sectionReadouts.appendChild(row.row);

        this._vehicleDebugEls = {
            dt: r.dt.text,
            fps: r.fps.text,
            rawDt: r.rawDt.text,
            synthetic: r.synthetic.text,
            fixedDt: r.fixedDt.text,
            subSteps: r.subSteps.text,
            alpha: r.alpha.text,
            anchorPos: r.anchorPos.text,
            anchorYaw: r.anchorYaw.text,
            locoPos: r.locoPos.text,
            locoSpeed: r.locoSpeed.text,
            posErr: r.posErr.text,
            yawErr: r.yawErr.text,
            screenPos: r.screenPos.text
        };

        const note = makeEl('div', 'options-note');
        note.textContent = 'Debug tab is gated by URL params: ?debug=true (or ?debugOptions=true). Synthetic mode "Stall" simulates frame-time spikes without changing simulation speed.';

        this.body.appendChild(sectionVehicle);
        this.body.appendChild(sectionReadouts);
        this.body.appendChild(note);

        this._refreshVehicleMotionDebug();
    }

    _renderLightingTab() {
        this._ensureDraftLighting();
        this._ensureDraftAtmosphere();
        this._ensureDraftBloom();
        this._ensureDraftColorGrading();
        this._ensureDraftSunFlare();

        const sectionIbl = makeEl('div', 'options-section');
        sectionIbl.appendChild(makeEl('div', 'options-section-title', 'IBL'));

        const sectionLighting = makeEl('div', 'options-section');
        sectionLighting.appendChild(makeEl('div', 'options-section-title', 'Renderer + Lights'));

        const sectionAtmosphere = makeEl('div', 'options-section');
        sectionAtmosphere.appendChild(makeEl('div', 'options-section-title', 'Atmosphere / Sky'));

        const d = this._draftLighting;
        const atmo = this._draftAtmosphere;
        const bloom = this._draftBloom;
        const grading = this._draftColorGrading;
        const sunFlare = this._draftSunFlare;
        const emit = () => this._emitLiveChange();
        let syncGradeEnabled = () => {};
        let syncSunFlareControls = () => {};
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
	                label: 'HDR background',
	                value: d.ibl.setBackground,
	                onChange: (v) => { d.ibl.setBackground = v; emit(); }
	            }),
            iblProbeSphere: makeToggleRow({
                label: 'Show IBL probe sphere',
                value: !!d.ibl.showProbeSphere,
                onChange: (v) => { d.ibl.showProbeSphere = v; emit(); }
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
            sunAzimuthDeg: makeNumberSliderRow({
                label: 'Sun azimuth (°)',
                value: atmo.sun.azimuthDeg,
                min: 0,
                max: 360,
                step: 1,
                digits: 0,
                onChange: (v) => { atmo.sun.azimuthDeg = v; emit(); }
            }),
            sunElevationDeg: makeNumberSliderRow({
                label: 'Sun elevation (°)',
                value: atmo.sun.elevationDeg,
                min: 0,
                max: 89,
                step: 1,
                digits: 0,
                onChange: (v) => { atmo.sun.elevationDeg = v; emit(); }
            }),
            skyBgMode: makeChoiceRow({
                label: 'Background priority',
                value: atmo.sky.iblBackgroundMode,
                options: [
                    { id: 'ibl', label: 'IBL (HDR background)' },
                    { id: 'gradient', label: 'Gradient (force sky)' }
                ],
                onChange: (v) => { atmo.sky.iblBackgroundMode = v; emit(); }
            }),
            skyHorizon: makeColorRow({
                label: 'Sky horizon',
                value: atmo.sky.horizonColor,
                onChange: (v) => { atmo.sky.horizonColor = v; emit(); }
            }),
            skyZenith: makeColorRow({
                label: 'Sky zenith',
                value: atmo.sky.zenithColor,
                onChange: (v) => { atmo.sky.zenithColor = v; emit(); }
            }),
            skyGround: makeColorRow({
                label: 'Sky ground',
                value: atmo.sky.groundColor,
                onChange: (v) => { atmo.sky.groundColor = v; emit(); }
            }),
            skyExposure: makeNumberSliderRow({
                label: 'Sky exposure',
                value: atmo.sky.exposure,
                min: 0,
                max: 8,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.sky.exposure = v; emit(); }
            }),
            skyCurve: makeNumberSliderRow({
                label: 'Sky curve',
                value: atmo.sky.curve,
                min: 0.05,
                max: 8,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.sky.curve = v; emit(); }
            }),
            skyDither: makeNumberSliderRow({
                label: 'Sky dither',
                value: atmo.sky.ditherStrength,
                min: 0,
                max: 2,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.sky.ditherStrength = v; emit(); }
            }),
            hazeEnabled: makeToggleRow({
                label: 'Horizon haze',
                value: atmo.haze.enabled,
                onChange: (v) => { atmo.haze.enabled = v; emit(); }
            }),
            hazeIntensity: makeNumberSliderRow({
                label: 'Haze intensity',
                value: atmo.haze.intensity,
                min: 0,
                max: 4,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.haze.intensity = v; emit(); }
            }),
            hazeThickness: makeNumberSliderRow({
                label: 'Haze thickness',
                value: atmo.haze.thickness,
                min: 0.02,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.haze.thickness = v; emit(); }
            }),
            hazeCurve: makeNumberSliderRow({
                label: 'Haze curve',
                value: atmo.haze.curve,
                min: 0.1,
                max: 8,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.haze.curve = v; emit(); }
            }),
            glareEnabled: makeToggleRow({
                label: 'Sun glare',
                value: atmo.glare.enabled,
                onChange: (v) => { atmo.glare.enabled = v; emit(); }
            }),
            glareIntensity: makeNumberSliderRow({
                label: 'Glare intensity',
                value: atmo.glare.intensity,
                min: 0,
                max: 20,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.glare.intensity = v; emit(); }
            }),
            glareSigma: makeNumberSliderRow({
                label: 'Glare size (σ °)',
                value: atmo.glare.sigmaDeg,
                min: 0.25,
                max: 60,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.glare.sigmaDeg = v; emit(); }
            }),
            glarePower: makeNumberSliderRow({
                label: 'Glare power',
                value: atmo.glare.power,
                min: 0.2,
                max: 6,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.glare.power = v; emit(); }
            }),
            discEnabled: makeToggleRow({
                label: 'Sun disc',
                value: atmo.disc.enabled,
                onChange: (v) => { atmo.disc.enabled = v; emit(); }
            }),
            discIntensity: makeNumberSliderRow({
                label: 'Disc intensity',
                value: atmo.disc.intensity,
                min: 0,
                max: 50,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.disc.intensity = v; emit(); }
            }),
            discSigma: makeNumberSliderRow({
                label: 'Disc size (σ °)',
                value: atmo.disc.sigmaDeg,
                min: 0.05,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.disc.sigmaDeg = v; emit(); }
            }),
            discCoreIntensity: makeNumberSliderRow({
                label: 'Disc core intensity',
                value: atmo.disc.coreIntensity,
                min: 0,
                max: 50,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.disc.coreIntensity = v; emit(); }
            }),
            discCoreSigma: makeNumberSliderRow({
                label: 'Disc core size (σ °)',
                value: atmo.disc.coreSigmaDeg,
                min: 0.02,
                max: 5,
                step: 0.01,
                digits: 2,
                onChange: (v) => { atmo.disc.coreSigmaDeg = v; emit(); }
            }),
            skyDebugMode: makeChoiceRow({
                label: 'Sky debug',
                value: atmo.debug.mode,
                options: [
                    { id: 'full', label: 'Full' },
                    { id: 'baseline', label: 'Baseline' },
                    { id: 'glare', label: 'Glare' },
                    { id: 'disc', label: 'Disc' }
                ],
                onChange: (v) => { atmo.debug.mode = v; emit(); }
            }),
            skySunRing: makeToggleRow({
                label: 'Show sun ring',
                value: atmo.debug.showSunRing,
                onChange: (v) => { atmo.debug.showSunRing = v; emit(); }
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
                        sunFlare.components = { core: false, halo: false, starburst: false, ghosting: false };
                        syncSunFlareControls();
                        emit();
                        return;
                    }
                    sunFlare.enabled = true;
                    sunFlare.preset = id;
                    if (id === 'cinematic') sunFlare.strength = 1.1;
                    else if (id === 'subtle') sunFlare.strength = 0.65;
                    const preset = getSunFlarePresetById(id);
                    if (preset?.components) sunFlare.components = { ...preset.components };
                    syncSunFlareControls();
                    emit();
                }
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
            sunFlareCore: makeToggleRow({
                label: 'Flare core',
                value: sunFlare.components?.core,
                onChange: (v) => { sunFlare.components.core = v; emit(); }
            }),
            sunFlareHalo: makeToggleRow({
                label: 'Flare halo/waves',
                value: sunFlare.components?.halo,
                onChange: (v) => { sunFlare.components.halo = v; emit(); }
            }),
            sunFlareStarburst: makeToggleRow({
                label: 'Flare starburst',
                value: sunFlare.components?.starburst,
                onChange: (v) => { sunFlare.components.starburst = v; emit(); }
            }),
            sunFlareGhosting: makeToggleRow({
                label: 'Flare ghosting',
                value: sunFlare.components?.ghosting,
                onChange: (v) => { sunFlare.components.ghosting = v; emit(); }
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
        sectionIbl.appendChild(controls.iblProbeSphere.row);

        let iblStatusSection = null;
        if (this._getIblDebugInfo) {
	            iblStatusSection = makeEl('div', 'options-section');
	            iblStatusSection.appendChild(makeEl('div', 'options-section-title', 'IBL Status'));
	            const rowEnvMap = makeValueRow({ label: 'Env map', value: '-' });
	            const rowIntensity = makeValueRow({ label: 'Config intensity', value: '-' });
	            const rowSceneEnv = makeValueRow({ label: 'Scene.environment', value: '-' });
	            const rowSceneBg = makeValueRow({ label: 'Scene.background', value: '-' });
	            const rowBgConfig = makeValueRow({ label: 'Config HDR background', value: '-' });
	            const rowEnvIsTexture = makeValueRow({ label: 'Env isTexture', value: '-' });
	            const rowEnvType = makeValueRow({ label: 'Env type', value: '-' });
	            const rowEnvMapMapping = makeValueRow({ label: 'Env mapping', value: '-' });
	            const rowEnvUserData = makeValueRow({ label: 'Env userData', value: '-' });
	            const rowSceneMatch = makeValueRow({ label: 'Env matches loaded', value: '-' });
	            const rowProbeEnvMap = makeValueRow({ label: 'Probe envMap', value: '-' });
	            const rowProbeEnvIsTexture = makeValueRow({ label: 'Probe env isTexture', value: '-' });
	            const rowProbeEnvType = makeValueRow({ label: 'Probe env type', value: '-' });
	            const rowProbeEnvMapMapping = makeValueRow({ label: 'Probe env mapping', value: '-' });
	            const rowProbeMaterial = makeValueRow({ label: 'Probe material', value: '-' });
	            const rowProbeIntensity = makeValueRow({ label: 'Probe envMapIntensity', value: '-' });
	            const rowProbeScreen = makeValueRow({ label: 'Probe screen', value: '-' });
	            const rowProbeVisible = makeValueRow({ label: 'Probe visible', value: '-' });
	            const rowProbeRadius = makeValueRow({ label: 'Probe radius', value: '-' });
	            const rowHdrUrl = makeValueRow({ label: 'HDR URL', value: '-' });
	            iblStatusSection.appendChild(rowEnvMap.row);
	            iblStatusSection.appendChild(rowIntensity.row);
	            iblStatusSection.appendChild(rowSceneEnv.row);
	            iblStatusSection.appendChild(rowSceneBg.row);
	            iblStatusSection.appendChild(rowBgConfig.row);
	            iblStatusSection.appendChild(rowEnvIsTexture.row);
	            iblStatusSection.appendChild(rowEnvType.row);
	            iblStatusSection.appendChild(rowEnvMapMapping.row);
	            iblStatusSection.appendChild(rowEnvUserData.row);
	            iblStatusSection.appendChild(rowSceneMatch.row);
	            iblStatusSection.appendChild(rowProbeEnvMap.row);
	            iblStatusSection.appendChild(rowProbeEnvIsTexture.row);
	            iblStatusSection.appendChild(rowProbeEnvType.row);
	            iblStatusSection.appendChild(rowProbeEnvMapMapping.row);
	            iblStatusSection.appendChild(rowProbeMaterial.row);
	            iblStatusSection.appendChild(rowProbeIntensity.row);
	            iblStatusSection.appendChild(rowProbeScreen.row);
	            iblStatusSection.appendChild(rowProbeVisible.row);
	            iblStatusSection.appendChild(rowProbeRadius.row);
	            iblStatusSection.appendChild(rowHdrUrl.row);
	            this._iblDebugEls = {
	                envMap: rowEnvMap.text,
	                intensity: rowIntensity.text,
	                sceneEnv: rowSceneEnv.text,
	                sceneBg: rowSceneBg.text,
	                bgConfig: rowBgConfig.text,
	                envIsTexture: rowEnvIsTexture.text,
	                envType: rowEnvType.text,
	                envMapMapping: rowEnvMapMapping.text,
	                envUserData: rowEnvUserData.text,
	                sceneMatch: rowSceneMatch.text,
	                probeEnvMap: rowProbeEnvMap.text,
	                probeEnvIsTexture: rowProbeEnvIsTexture.text,
	                probeEnvType: rowProbeEnvType.text,
	                probeEnvMapMapping: rowProbeEnvMapMapping.text,
	                probeMaterial: rowProbeMaterial.text,
	                probeIntensity: rowProbeIntensity.text,
	                probeScreen: rowProbeScreen.text,
	                probeVisible: rowProbeVisible.text,
	                probeRadius: rowProbeRadius.text,
	                hdrUrl: rowHdrUrl.text
	            };
	        }

        sectionLighting.appendChild(controls.exposure.row);
        sectionLighting.appendChild(controls.hemi.row);
        sectionLighting.appendChild(controls.sun.row);

        sectionAtmosphere.appendChild(controls.sunAzimuthDeg.row);
        sectionAtmosphere.appendChild(controls.sunElevationDeg.row);
        sectionAtmosphere.appendChild(controls.skyBgMode.row);
        sectionAtmosphere.appendChild(controls.skyHorizon.row);
        sectionAtmosphere.appendChild(controls.skyZenith.row);
        sectionAtmosphere.appendChild(controls.skyGround.row);
        sectionAtmosphere.appendChild(controls.skyExposure.row);
        sectionAtmosphere.appendChild(controls.skyCurve.row);
        sectionAtmosphere.appendChild(controls.skyDither.row);
        sectionAtmosphere.appendChild(controls.hazeEnabled.row);
        sectionAtmosphere.appendChild(controls.hazeIntensity.row);
        sectionAtmosphere.appendChild(controls.hazeThickness.row);
        sectionAtmosphere.appendChild(controls.hazeCurve.row);
        sectionAtmosphere.appendChild(controls.glareEnabled.row);
        sectionAtmosphere.appendChild(controls.glareIntensity.row);
        sectionAtmosphere.appendChild(controls.glareSigma.row);
        sectionAtmosphere.appendChild(controls.glarePower.row);
        sectionAtmosphere.appendChild(controls.discEnabled.row);
        sectionAtmosphere.appendChild(controls.discIntensity.row);
        sectionAtmosphere.appendChild(controls.discSigma.row);
        sectionAtmosphere.appendChild(controls.discCoreIntensity.row);
        sectionAtmosphere.appendChild(controls.discCoreSigma.row);
        sectionAtmosphere.appendChild(controls.skyDebugMode.row);
        sectionAtmosphere.appendChild(controls.skySunRing.row);

        const sectionPost = makeEl('div', 'options-section');
        sectionPost.appendChild(makeEl('div', 'options-section-title', 'Post-processing'));
        if (this._getPostProcessingDebugInfo) {
            const pipelineRow = makeValueRow({ label: 'Post-processing pipeline', value: '-' });
            const bloomRow = makeValueRow({ label: 'Bloom (active now)', value: '-' });
            const aoRow = makeValueRow({ label: 'Ambient occlusion (active now)', value: '-' });
            const gradeRow = makeValueRow({ label: 'Color grading (active now)', value: '-' });
            sectionPost.appendChild(pipelineRow.row);
            sectionPost.appendChild(bloomRow.row);
            sectionPost.appendChild(aoRow.row);
            sectionPost.appendChild(gradeRow.row);
            this._postDebugEls = { pipeline: pipelineRow.text, bloom: bloomRow.text, ao: aoRow.text, grading: gradeRow.text };
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
        sectionPost.appendChild(controls.sunFlareStrength.row);
        sectionPost.appendChild(controls.sunFlareCore.row);
        sectionPost.appendChild(controls.sunFlareHalo.row);
        sectionPost.appendChild(controls.sunFlareStarburst.row);
        sectionPost.appendChild(controls.sunFlareGhosting.row);
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

        syncSunFlareControls = () => {
            const enabled = !!sunFlare.enabled;
            const disabled = !enabled;
            controls.sunFlareStrength.range.disabled = disabled;
            controls.sunFlareStrength.number.disabled = disabled;
            for (const entry of [controls.sunFlareCore, controls.sunFlareHalo, controls.sunFlareStarburst, controls.sunFlareGhosting]) {
                entry.toggle.disabled = disabled;
            }
            controls.sunFlareCore.toggle.checked = !!sunFlare.components?.core;
            controls.sunFlareHalo.toggle.checked = !!sunFlare.components?.halo;
            controls.sunFlareStarburst.toggle.checked = !!sunFlare.components?.starburst;
            controls.sunFlareGhosting.toggle.checked = !!sunFlare.components?.ghosting;

            const strength = Number.isFinite(sunFlare.strength) ? sunFlare.strength : 0;
            controls.sunFlareStrength.range.value = String(strength);
            controls.sunFlareStrength.number.value = String(strength.toFixed(2));
        };
        syncSunFlareControls();

        const note = makeEl('div', 'options-note');
        note.textContent = 'URL params override saved settings (e.g. ibl, iblIntensity, iblBackground, bloom, sunFlare, grade). Bloom affects only bright pixels; raise threshold to reduce glow.';

        this.body.appendChild(sectionIbl);
        if (iblStatusSection) this.body.appendChild(iblStatusSection);
        this.body.appendChild(sectionLighting);
        this.body.appendChild(sectionAtmosphere);
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
                setBackground: d.ibl.setBackground,
                showProbeSphere: false
            }
        };

        this._draftAtmosphere = JSON.parse(JSON.stringify(getDefaultResolvedAtmosphereSettings()));

        this._draftShadows = JSON.parse(JSON.stringify(getDefaultResolvedShadowSettings()));

        this._draftAntiAliasing = JSON.parse(JSON.stringify(getDefaultResolvedAntiAliasingSettings()));

        this._draftAmbientOcclusion = JSON.parse(JSON.stringify(getDefaultResolvedAmbientOcclusionSettings()));

        const bloom = getDefaultResolvedBloomSettings();
        this._draftBloom = {
            enabled: bloom.enabled,
            strength: bloom.strength,
            radius: bloom.radius,
            threshold: bloom.threshold
        };

        this._draftSunBloom = JSON.parse(JSON.stringify(getDefaultResolvedSunBloomSettings()));

        const grade = getDefaultResolvedColorGradingSettings();
        this._draftColorGrading = {
            preset: grade.preset,
            intensity: grade.intensity
        };

        const sunFlare = getDefaultResolvedSunFlareSettings();
        this._draftSunFlare = {
            enabled: sunFlare.enabled,
            preset: sunFlare.preset,
            strength: sunFlare.strength,
            components: { ...(sunFlare.components ?? {}) }
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
	            fine: { ...asphaltNoise.fine },
	            markings: { ...asphaltNoise.markings },
	            color: { ...asphaltNoise.color },
	            livedIn: JSON.parse(JSON.stringify(asphaltNoise.livedIn ?? {}))
	        };

        this._draftVehicleMotionDebug = {
            enabled: false,
            overlay: true,
            logSpikes: false,
            logCameraCatchup: false,
            logCameraLag: false,
            logCameraEvents: false,
            camera: { freeze: false },
            backStep: { minProjMeters: 0.05 },
            cameraCatchup: { minDfwdMeters: 0.05, minCameraMoveMeters: 0.01, minCamBusDistDropMeters: 0.05 },
            cameraLag: { minBusStepMeters: 0.2, maxCamStepRatio: 0.55 },
            spike: { maxDistMeters: 0.9, maxYawDeg: 25, maxScreenPx: 18 },
            syntheticDt: { enabled: false, pattern: 'off', mode: 'stall', stallMs: 34 }
        };
        this._renderTab();
        this._emitLiveChange();
    }

    getDraft() {
        this._ensureDraftAsphaltNoise();
        this._ensureDraftBuildingWindowVisuals();
        this._ensureDraftLighting();
        this._ensureDraftAtmosphere();
        this._ensureDraftShadows();
        this._ensureDraftAntiAliasing();
        this._ensureDraftAmbientOcclusion();
        this._ensureDraftBloom();
        this._ensureDraftSunBloom();
        this._ensureDraftColorGrading();
        this._ensureDraftSunFlare();
        this._ensureDraftVehicleMotionDebug();
        const d = this._draftLighting;
        const atmo = this._draftAtmosphere;
        const shadows = this._draftShadows;
        const antiAliasing = this._draftAntiAliasing;
        const ambientOcclusion = this._draftAmbientOcclusion;
        const bloom = this._draftBloom;
        const sunBloom = this._draftSunBloom;
        const grade = this._draftColorGrading;
        const asphaltNoise = this._draftAsphaltNoise;
        const windowVisuals = this._draftBuildingWindowVisuals;
        const sunFlare = this._draftSunFlare;
        const vehicleMotionDebug = this._draftVehicleMotionDebug;
        return {
            lighting: {
                exposure: d.exposure,
                hemiIntensity: d.hemiIntensity,
                sunIntensity: d.sunIntensity,
                ibl: {
                    enabled: !!d.ibl.enabled,
                    envMapIntensity: d.ibl.envMapIntensity,
                    setBackground: !!d.ibl.setBackground,
                    showProbeSphere: !!d.ibl.showProbeSphere
                }
            },
            atmosphere: JSON.parse(JSON.stringify(atmo)),
            shadows: {
                quality: String(shadows?.quality ?? 'medium')
            },
            antiAliasing: {
                mode: String(antiAliasing?.mode ?? 'off'),
                msaa: { samples: antiAliasing?.msaa?.samples },
                taa: {
                    preset: String(antiAliasing?.taa?.preset ?? 'high'),
                    historyStrength: antiAliasing?.taa?.historyStrength,
                    jitter: antiAliasing?.taa?.jitter,
                    sharpen: antiAliasing?.taa?.sharpen,
                    clampStrength: antiAliasing?.taa?.clampStrength
                },
                smaa: {
                    preset: String(antiAliasing?.smaa?.preset ?? 'medium'),
                    threshold: antiAliasing?.smaa?.threshold,
                    maxSearchSteps: antiAliasing?.smaa?.maxSearchSteps,
                    maxSearchStepsDiag: antiAliasing?.smaa?.maxSearchStepsDiag,
                    cornerRounding: antiAliasing?.smaa?.cornerRounding
                },
                fxaa: {
                    preset: String(antiAliasing?.fxaa?.preset ?? 'balanced'),
                    edgeThreshold: antiAliasing?.fxaa?.edgeThreshold
                }
            },
            ambientOcclusion: {
                mode: String(ambientOcclusion?.mode ?? 'off'),
                alpha: {
                    handling: String(ambientOcclusion?.alpha?.handling ?? 'alpha_test'),
                    threshold: ambientOcclusion?.alpha?.threshold
                },
                ssao: {
                    intensity: ambientOcclusion?.ssao?.intensity,
                    radius: ambientOcclusion?.ssao?.radius,
                    quality: String(ambientOcclusion?.ssao?.quality ?? 'medium')
                },
                gtao: {
                    intensity: ambientOcclusion?.gtao?.intensity,
                    radius: ambientOcclusion?.gtao?.radius,
                    quality: String(ambientOcclusion?.gtao?.quality ?? 'medium'),
                    denoise: !!ambientOcclusion?.gtao?.denoise
                }
            },
            bloom: {
                enabled: !!bloom.enabled,
                strength: bloom.strength,
                radius: bloom.radius,
                threshold: bloom.threshold
            },
            sunBloom: JSON.parse(JSON.stringify(sunBloom)),
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
                },
                color: {
                    value: asphaltNoise.color?.value,
                    warmCool: asphaltNoise.color?.warmCool,
                    saturation: asphaltNoise.color?.saturation
                },
                markings: {
                    enabled: !!asphaltNoise.markings?.enabled,
                    colorStrength: asphaltNoise.markings?.colorStrength,
                    roughnessStrength: asphaltNoise.markings?.roughnessStrength,
                    debug: !!asphaltNoise.markings?.debug
                },
                livedIn: {
                    edgeDirt: {
                        enabled: !!asphaltNoise.livedIn?.edgeDirt?.enabled,
                        strength: asphaltNoise.livedIn?.edgeDirt?.strength,
                        width: asphaltNoise.livedIn?.edgeDirt?.width,
                        scale: asphaltNoise.livedIn?.edgeDirt?.scale
                    },
                    sidewalkGrassEdgeStrip: {
                        enabled: !!asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.enabled,
                        width: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.width,
                        opacity: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.opacity,
                        roughness: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.roughness,
                        metalness: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.metalness,
                        colorHex: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.colorHex,
                        fadePower: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.fadePower
                    },
                    cracks: {
                        enabled: !!asphaltNoise.livedIn?.cracks?.enabled,
                        strength: asphaltNoise.livedIn?.cracks?.strength,
                        scale: asphaltNoise.livedIn?.cracks?.scale
                    },
                    patches: {
                        enabled: !!asphaltNoise.livedIn?.patches?.enabled,
                        strength: asphaltNoise.livedIn?.patches?.strength,
                        scale: asphaltNoise.livedIn?.patches?.scale,
                        coverage: asphaltNoise.livedIn?.patches?.coverage
                    },
                    tireWear: {
                        enabled: !!asphaltNoise.livedIn?.tireWear?.enabled,
                        strength: asphaltNoise.livedIn?.tireWear?.strength,
                        scale: asphaltNoise.livedIn?.tireWear?.scale
                    }
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
                strength: sunFlare.strength,
                components: {
                    core: !!sunFlare.components?.core,
                    halo: !!sunFlare.components?.halo,
                    starburst: !!sunFlare.components?.starburst,
                    ghosting: !!sunFlare.components?.ghosting
                }
            },
            vehicleMotionDebug: {
                enabled: !!vehicleMotionDebug.enabled,
                overlay: vehicleMotionDebug.overlay !== false,
                logSpikes: vehicleMotionDebug.logSpikes === true,
                logCameraCatchup: vehicleMotionDebug.logCameraCatchup === true,
                logCameraLag: vehicleMotionDebug.logCameraLag === true,
                logCameraEvents: vehicleMotionDebug.logCameraEvents === true,
                logCameraTargetMismatch: vehicleMotionDebug.logCameraTargetMismatch === true,
                logGate: { minScreenPx: vehicleMotionDebug.logGate?.minScreenPx },
                camera: { freeze: vehicleMotionDebug.camera?.freeze === true },
                backStep: { minProjMeters: vehicleMotionDebug.backStep?.minProjMeters },
                cameraCatchup: {
                    minDfwdMeters: vehicleMotionDebug.cameraCatchup?.minDfwdMeters,
                    minCameraMoveMeters: vehicleMotionDebug.cameraCatchup?.minCameraMoveMeters,
                    minCamBusDistDropMeters: vehicleMotionDebug.cameraCatchup?.minCamBusDistDropMeters
                },
                cameraLag: {
                    minBusStepMeters: vehicleMotionDebug.cameraLag?.minBusStepMeters,
                    maxCamStepRatio: vehicleMotionDebug.cameraLag?.maxCamStepRatio
                },
                cameraTargetMismatch: {
                    minAnchorMatrixErrMeters: vehicleMotionDebug.cameraTargetMismatch?.minAnchorMatrixErrMeters
                },
                spike: {
                    maxDistMeters: vehicleMotionDebug.spike?.maxDistMeters,
                    maxYawDeg: vehicleMotionDebug.spike?.maxYawDeg,
                    maxScreenPx: vehicleMotionDebug.spike?.maxScreenPx
                },
                syntheticDt: {
                    enabled: vehicleMotionDebug.syntheticDt?.enabled === true,
                    pattern: String(vehicleMotionDebug.syntheticDt?.pattern ?? 'off'),
                    mode: String(vehicleMotionDebug.syntheticDt?.mode ?? 'stall'),
                    stallMs: vehicleMotionDebug.syntheticDt?.stallMs
                }
            }
        };
    }
}
