// src/graphics/gui/options/OptionsUI.js
// Tabbed Options UI overlay with persisted lighting controls.

import { getDefaultResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getDefaultResolvedBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { getDefaultResolvedColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { getColorGradingPresetOptions } from '../../visuals/postprocessing/ColorGradingPresets.js';
import { getDefaultResolvedBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { getDefaultResolvedAsphaltNoiseSettings } from '../../visuals/city/AsphaltNoiseSettings.js';
import { getDefaultResolvedSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { getSunFlarePresetById, getSunFlarePresetOptions } from '../../visuals/sun/SunFlarePresets.js';
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
    const keys = ['lighting', 'bloom', 'colorGrading', 'sunFlare', 'buildingWindowVisuals', 'asphaltNoise'];
    const enabled = keys.filter((k) => src[k] !== false);
    return enabled.length ? enabled.join(', ') : '(none)';
}

export class OptionsUI {
    constructor({
        visibleTabs = null,
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
        const title = makeEl('div', 'options-title', titleText);
        const subtitle = makeEl('div', 'options-subtitle', subtitleText);
        header.appendChild(title);
        header.appendChild(subtitle);

        this.tabs = makeEl('div', 'options-tabs');
        this._visibleTabs = (() => {
            if (!Array.isArray(visibleTabs)) return ['lighting', 'asphalt', 'buildings'];
            const out = [];
            for (const entry of visibleTabs) {
                const raw = String(entry ?? '').toLowerCase();
                const key = raw === 'gameplay' ? 'buildings' : raw;
                if (key !== 'lighting' && key !== 'asphalt' && key !== 'buildings') continue;
                if (out.includes(key)) continue;
                out.push(key);
            }
            return out.length ? out : ['lighting', 'asphalt', 'buildings'];
        })();

        const TAB_LABELS = {
            lighting: 'Lighting',
            asphalt: 'Asphalt',
            buildings: 'Buildings'
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
            : (initialTab === 'asphalt' ? 'asphalt' : 'lighting');
        this._tab = this._visibleTabs.includes(desiredTab) ? desiredTab : (this._visibleTabs[0] ?? desiredTab);
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

    _setDraftFromFullDraft(fullDraft) {
        const d = fullDraft && typeof fullDraft === 'object' ? fullDraft : null;
        if (!d) return;
        if (d.lighting) this._draftLighting = JSON.parse(JSON.stringify(d.lighting));
        if (d.bloom) this._draftBloom = JSON.parse(JSON.stringify(d.bloom));
        if (d.colorGrading) this._draftColorGrading = JSON.parse(JSON.stringify(d.colorGrading));
        if (d.sunFlare) this._draftSunFlare = JSON.parse(JSON.stringify(d.sunFlare));
        if (d.buildingWindowVisuals) this._draftBuildingWindowVisuals = JSON.parse(JSON.stringify(d.buildingWindowVisuals));
        if (d.asphaltNoise) this._draftAsphaltNoise = JSON.parse(JSON.stringify(d.asphaltNoise));
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
        const desired = (key === 'buildings' || key === 'gameplay')
            ? 'buildings'
            : (key === 'asphalt' ? 'asphalt' : 'lighting');
        const next = this._visibleTabs.includes(desired) ? desired : (this._visibleTabs[0] ?? desired);
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
                value: edgeDirt.strength ?? 0.18,
                min: 0,
                max: 1,
                step: 0.01,
                digits: 2,
                onChange: (v) => { edgeDirt.strength = v; emit(); }
            }),
            edgeDirtWidth: makeNumberSliderRow({
                label: 'Edge dirt width (m)',
                value: edgeDirt.width ?? 0.65,
                min: 0,
                max: 1.25,
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
                value: cracks.strength ?? 0.12,
                min: 0,
                max: 1,
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
                value: patches.strength ?? 0.1,
                min: 0,
                max: 1,
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
                value: tireWear.strength ?? 0.1,
                min: 0,
                max: 1,
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
	        this.body.appendChild(sectionColor);
	        this.body.appendChild(sectionLivedIn);
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
                    setBackground: !!d.ibl.setBackground,
                    showProbeSphere: !!d.ibl.showProbeSphere
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
            }
        };
    }
}
