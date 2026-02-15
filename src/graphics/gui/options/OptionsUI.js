// src/graphics/gui/options/OptionsUI.js
// Tabbed Options UI overlay with persisted lighting controls.

import { getDefaultResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getDefaultResolvedShadowSettings } from '../../lighting/ShadowSettings.js';
import { getDefaultResolvedAntiAliasingSettings } from '../../visuals/postprocessing/AntiAliasingSettings.js';
import { getDefaultResolvedAmbientOcclusionSettings } from '../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { getDefaultResolvedBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { getDefaultResolvedSunBloomSettings } from '../../visuals/postprocessing/SunBloomSettings.js';
import { getDefaultResolvedColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { getDefaultResolvedBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { getDefaultResolvedAsphaltNoiseSettings } from '../../visuals/city/AsphaltNoiseSettings.js';
import { getDefaultResolvedSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { getDefaultResolvedAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import {
    applyOptionsPresetToDraft,
    createOptionsPresetFromDraft,
    parseOptionsPresetJson,
    stringifyOptionsPreset
} from './OptionsPreset.js';
import { makeEl } from './OptionsUiControls.js';
import { renderAsphaltTab } from './tabs/renderAsphaltTab.js';
import { renderBuildingsTab } from './tabs/renderBuildingsTab.js';
import { renderDebugTab } from './tabs/renderDebugTab.js';
import { renderGrassTab } from './tabs/renderGrassTab.js';
import { renderGraphicsTab } from './tabs/renderGraphicsTab.js';
import { renderLightingTab } from './tabs/renderLightingTab.js';
import { renderSunBloomTab } from './tabs/renderSunBloomTab.js';

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
                    const denoise = g?.denoiseActive === true ? 'denoise' : 'raw';
                    const debug = g?.debugViewActive === true ? ' (debug view)' : '';
                    const fallbackMap = {
                        denoise_unsupported: ' (denoise fallback)',
                        debug_output_unsupported: ' (debug fallback)',
                        denoise_runtime_error: ' (denoise runtime fallback)'
                    };
                    const fallbackReason = typeof g?.fallbackReason === 'string' ? g.fallbackReason : '';
                    const fallback = fallbackMap[fallbackReason] ?? '';
                    els.ao.textContent = `GTAO (${modeLabel}) (${status}) (${denoise})${cache}${debug}${fallback}`;
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
        if (d.gtao.debugView === undefined) d.gtao.debugView = defaults.gtao.debugView;
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
        return renderAsphaltTab.call(this);
    }

    _renderGrassTab() {
        return renderGrassTab.call(this);
    }

    _renderBuildingsTab() {
        return renderBuildingsTab.call(this);
    }

    _renderSunBloomTab() {
        return renderSunBloomTab.call(this);
    }

    _renderGraphicsTab() {
        return renderGraphicsTab.call(this);
    }

    _renderDebugTab() {
        return renderDebugTab.call(this);
    }

    _renderLightingTab() {
        return renderLightingTab.call(this);
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
                staticAo: {
                    mode: String(ambientOcclusion?.staticAo?.mode ?? 'off'),
                    intensity: ambientOcclusion?.staticAo?.intensity,
                    quality: String(ambientOcclusion?.staticAo?.quality ?? 'medium'),
                    radius: ambientOcclusion?.staticAo?.radius,
                    wallHeight: ambientOcclusion?.staticAo?.wallHeight,
                    debugView: !!ambientOcclusion?.staticAo?.debugView
                },
                busContactShadow: {
                    enabled: !!ambientOcclusion?.busContactShadow?.enabled,
                    intensity: ambientOcclusion?.busContactShadow?.intensity,
                    radius: ambientOcclusion?.busContactShadow?.radius,
                    softness: ambientOcclusion?.busContactShadow?.softness,
                    maxDistance: ambientOcclusion?.busContactShadow?.maxDistance
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
                    denoise: !!ambientOcclusion?.gtao?.denoise,
                    debugView: !!ambientOcclusion?.gtao?.debugView,
                    updateMode: String(ambientOcclusion?.gtao?.updateMode ?? 'every_frame'),
                    motionThreshold: {
                        positionMeters: ambientOcclusion?.gtao?.motionThreshold?.positionMeters,
                        rotationDeg: ambientOcclusion?.gtao?.motionThreshold?.rotationDeg,
                        fovDeg: ambientOcclusion?.gtao?.motionThreshold?.fovDeg
                    }
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
