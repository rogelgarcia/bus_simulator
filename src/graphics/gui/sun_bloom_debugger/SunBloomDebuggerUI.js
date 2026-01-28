// src/graphics/gui/sun_bloom_debugger/SunBloomDebuggerUI.js
// Docked Options-style panel for the Sun Bloom Debug tool.

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

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
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

function makeButtonRow({ label, text = 'Action', onClick }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');
    const btn = makeEl('button', 'sunbloom-action-btn', text);
    btn.type = 'button';
    btn.addEventListener('click', () => onClick?.());
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    return { row, btn };
}

function makeActionRow({ label, actions = [] } = {}) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');
    const wrap = makeEl('div', 'sunbloom-action-row');

    const buttons = [];
    for (const a of Array.isArray(actions) ? actions : []) {
        const btn = makeEl('button', 'sunbloom-action-btn', String(a?.label ?? 'Action'));
        btn.type = 'button';
        btn.addEventListener('click', () => a?.onClick?.());
        wrap.appendChild(btn);
        buttons.push(btn);
    }

    right.appendChild(wrap);
    row.appendChild(left);
    row.appendChild(right);
    return { row, wrap, buttons };
}

export class SunBloomDebuggerUI {
    constructor({
        initialSettings,
        iblOptions,
        onChange,
        onDetectSun
    } = {}) {
        this._draft = { ...(initialSettings ?? {}) };
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onDetectSun = typeof onDetectSun === 'function' ? onDetectSun : null;
        this._isSetting = false;
        this._tab = 'sun_bloom';

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-sun-bloom-debug-options';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const title = makeEl('div', 'options-title', 'Sun Bloom Debug');
        const subtitle = makeEl('div', 'options-subtitle', 'RMB orbit · MMB pan · Wheel zoom · F frame · R reset · C toggle A/B');
        header.appendChild(title);
        header.appendChild(subtitle);

        this.tabRow = makeEl('div', 'sunbloom-tab-row');
        this.tabAtmosphereBtn = makeEl('button', 'sunbloom-tab-btn', 'Atmosphere');
        this.tabAtmosphereBtn.type = 'button';
        this.tabSunBloomBtn = makeEl('button', 'sunbloom-tab-btn', 'Sun Bloom');
        this.tabSunBloomBtn.type = 'button';
        this.tabRow.appendChild(this.tabAtmosphereBtn);
        this.tabRow.appendChild(this.tabSunBloomBtn);

        this.body = makeEl('div', 'options-body');

        this._controls = {};

        this._tabAtmosphereEl = makeEl('div', 'sunbloom-tab-panel');
        this._tabAtmosphereEl.dataset.tab = 'atmosphere';

        this._tabSunBloomEl = makeEl('div', 'sunbloom-tab-panel');
        this._tabSunBloomEl.dataset.tab = 'sun_bloom';

        this._buildAtmosphereTab({ iblOptions });
        this._buildSunBloomTab();

        this.body.appendChild(this._tabAtmosphereEl);
        this.body.appendChild(this._tabSunBloomEl);

        this.tabAtmosphereBtn.addEventListener('click', () => this.setTab('atmosphere'));
        this.tabSunBloomBtn.addEventListener('click', () => this.setTab('sun_bloom'));

        this.panel.appendChild(header);
        this.panel.appendChild(this.tabRow);
        this.panel.appendChild(this.body);
        this.root.appendChild(this.panel);

        this.hud = makeEl('div', 'ui-panel sunbloom-hud');
        this.hud.id = 'ui-sunbloom-hud';
        this.hudLines = makeEl('div', null, '');
        this.hud.appendChild(this.hudLines);

        this._onHudToggleKeyDown = (e) => {
            if (!e) return;
            if (e.code !== 'KeyH' && e.key !== 'h' && e.key !== 'H') return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
            this.setHudVisible(!this.isHudVisible());
        };
        window.addEventListener('keydown', this._onHudToggleKeyDown, { passive: false });

        this.setTab(this._tab);
    }

    _buildAtmosphereTab({ iblOptions } = {}) {
        const sectionEnv = makeEl('div', 'options-section');
        sectionEnv.appendChild(makeEl('div', 'options-section-title', 'Environment'));
        this._controls.iblId = makeSelectRow({
            label: 'HDRI',
            value: this._draft.iblId ?? '',
            options: iblOptions ?? [],
            onChange: (id) => {
                this._draft.iblId = id;
                this._emit();
            }
        });
        this._controls.iblEnabled = makeToggleRow({
            label: 'IBL enabled',
            value: this._draft.iblEnabled ?? false,
            onChange: (v) => {
                this._draft.iblEnabled = v;
                this._emit();
            }
        });
        this._controls.backgroundEnabled = makeToggleRow({
            label: 'HDR background',
            value: this._draft.backgroundEnabled ?? true,
            onChange: (v) => {
                this._draft.backgroundEnabled = v;
                this._emit();
            }
        });
        this._controls.envMapIntensity = makeNumberSliderRow({
            label: 'Env intensity',
            value: this._draft.envMapIntensity ?? 0.25,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.envMapIntensity = v;
                this._emit();
            }
        });
        sectionEnv.appendChild(this._controls.iblId.row);
        sectionEnv.appendChild(this._controls.iblEnabled.row);
        sectionEnv.appendChild(this._controls.backgroundEnabled.row);
        sectionEnv.appendChild(this._controls.envMapIntensity.row);

        const sectionLight = makeEl('div', 'options-section');
        sectionLight.appendChild(makeEl('div', 'options-section-title', 'Lighting'));
        this._controls.exposure = makeNumberSliderRow({
            label: 'Exposure',
            value: this._draft.exposure ?? 1.6,
            min: 0.1,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.exposure = v;
                this._emit();
            }
        });
        this._controls.sunIntensity = makeNumberSliderRow({
            label: 'Sun intensity',
            value: this._draft.sunIntensity ?? 1.2,
            min: 0,
            max: 10,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunIntensity = v;
                this._emit();
            }
        });
        this._controls.hemiIntensity = makeNumberSliderRow({
            label: 'Hemi intensity',
            value: this._draft.hemiIntensity ?? 0.85,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.hemiIntensity = v;
                this._emit();
            }
        });
        sectionLight.appendChild(this._controls.exposure.row);
        sectionLight.appendChild(this._controls.sunIntensity.row);
        sectionLight.appendChild(this._controls.hemiIntensity.row);

        const sectionSunDir = makeEl('div', 'options-section');
        sectionSunDir.appendChild(makeEl('div', 'options-section-title', 'Sun Direction'));
        this._controls.sunAzimuthDeg = makeNumberSliderRow({
            label: 'Azimuth (°)',
            value: this._draft.sunAzimuthDeg ?? 45,
            min: 0,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.sunAzimuthDeg = v;
                this._emit();
            }
        });
        this._controls.sunElevationDeg = makeNumberSliderRow({
            label: 'Elevation (°)',
            value: this._draft.sunElevationDeg ?? 35,
            min: 0,
            max: 89,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.sunElevationDeg = v;
                this._emit();
            }
        });
        this._controls.detectSun = makeButtonRow({
            label: 'Align to HDR',
            text: 'Detect',
            onClick: () => this._onDetectSun?.()
        });
        sectionSunDir.appendChild(this._controls.sunAzimuthDeg.row);
        sectionSunDir.appendChild(this._controls.sunElevationDeg.row);
        sectionSunDir.appendChild(this._controls.detectSun.row);

        const sectionSky = makeEl('div', 'options-section');
        sectionSky.appendChild(makeEl('div', 'options-section-title', 'Analytic Sky'));
        this._controls.skyBgMode = makeSelectRow({
            label: 'Background priority',
            value: this._draft.skyBgMode ?? 'ibl',
            options: [
                { id: 'ibl', label: 'IBL (HDR background)' },
                { id: 'gradient', label: 'Gradient (force sky)' }
            ],
            onChange: (id) => {
                this._draft.skyBgMode = id;
                this._emit();
            }
        });
        this._controls.skyDebugMode = makeSelectRow({
            label: 'Sky debug',
            value: this._draft.skyDebugMode ?? 'full',
            options: [
                { id: 'full', label: 'Full' },
                { id: 'baseline', label: 'Baseline' },
                { id: 'glare', label: 'Glare' },
                { id: 'disc', label: 'Disc' }
            ],
            onChange: (id) => {
                this._draft.skyDebugMode = id;
                this._emit();
            }
        });
        this._controls.skySunRing = makeToggleRow({
            label: 'Show sun ring',
            value: this._draft.skySunRing ?? false,
            onChange: (v) => {
                this._draft.skySunRing = v;
                this._emit();
            }
        });
        this._controls.skyHorizonColor = makeColorRow({
            label: 'Sky horizon',
            value: this._draft.skyHorizonColor ?? '#EAF9FF',
            onChange: (v) => {
                this._draft.skyHorizonColor = v;
                this._emit();
            }
        });
        this._controls.skyZenithColor = makeColorRow({
            label: 'Sky zenith',
            value: this._draft.skyZenithColor ?? '#7BCFFF',
            onChange: (v) => {
                this._draft.skyZenithColor = v;
                this._emit();
            }
        });
        this._controls.skyGroundColor = makeColorRow({
            label: 'Sky ground',
            value: this._draft.skyGroundColor ?? '#EAF9FF',
            onChange: (v) => {
                this._draft.skyGroundColor = v;
                this._emit();
            }
        });
        this._controls.skyExposure = makeNumberSliderRow({
            label: 'Sky exposure',
            value: this._draft.skyExposure ?? 1.0,
            min: 0,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.skyExposure = v;
                this._emit();
            }
        });
        this._controls.skyCurve = makeNumberSliderRow({
            label: 'Sky curve',
            value: this._draft.skyCurve ?? 1.0,
            min: 0.05,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.skyCurve = v;
                this._emit();
            }
        });
        this._controls.skyDither = makeNumberSliderRow({
            label: 'Sky dither',
            value: this._draft.skyDither ?? 0.85,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.skyDither = v;
                this._emit();
            }
        });
        this._controls.hazeEnabled = makeToggleRow({
            label: 'Horizon haze',
            value: this._draft.hazeEnabled ?? true,
            onChange: (v) => {
                this._draft.hazeEnabled = v;
                this._emit();
            }
        });
        this._controls.hazeIntensity = makeNumberSliderRow({
            label: 'Haze intensity',
            value: this._draft.hazeIntensity ?? 0.22,
            min: 0,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.hazeIntensity = v;
                this._emit();
            }
        });
        this._controls.hazeThickness = makeNumberSliderRow({
            label: 'Haze thickness',
            value: this._draft.hazeThickness ?? 0.22,
            min: 0.02,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.hazeThickness = v;
                this._emit();
            }
        });
        this._controls.hazeCurve = makeNumberSliderRow({
            label: 'Haze curve',
            value: this._draft.hazeCurve ?? 1.6,
            min: 0.1,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.hazeCurve = v;
                this._emit();
            }
        });
        this._controls.glareEnabled = makeToggleRow({
            label: 'Sun glare',
            value: this._draft.glareEnabled ?? true,
            onChange: (v) => {
                this._draft.glareEnabled = v;
                this._emit();
            }
        });
        this._controls.glareIntensity = makeNumberSliderRow({
            label: 'Glare intensity',
            value: this._draft.glareIntensity ?? 0.95,
            min: 0,
            max: 20,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.glareIntensity = v;
                this._emit();
            }
        });
        this._controls.glareSigmaDeg = makeNumberSliderRow({
            label: 'Glare size (σ °)',
            value: this._draft.glareSigmaDeg ?? 10,
            min: 0.25,
            max: 60,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.glareSigmaDeg = v;
                this._emit();
            }
        });
        this._controls.glarePower = makeNumberSliderRow({
            label: 'Glare power',
            value: this._draft.glarePower ?? 1.0,
            min: 0.2,
            max: 6,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.glarePower = v;
                this._emit();
            }
        });
        this._controls.discEnabled = makeToggleRow({
            label: 'Sky sun disc',
            value: this._draft.discEnabled ?? false,
            onChange: (v) => {
                this._draft.discEnabled = v;
                this._emit();
            }
        });
        this._controls.discIntensity = makeNumberSliderRow({
            label: 'Disc intensity',
            value: this._draft.discIntensity ?? 4.0,
            min: 0,
            max: 50,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.discIntensity = v;
                this._emit();
            }
        });
        this._controls.discSigmaDeg = makeNumberSliderRow({
            label: 'Disc size (σ °)',
            value: this._draft.discSigmaDeg ?? 0.22,
            min: 0.05,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.discSigmaDeg = v;
                this._emit();
            }
        });
        this._controls.discCoreIntensity = makeNumberSliderRow({
            label: 'Disc core intensity',
            value: this._draft.discCoreIntensity ?? 2.5,
            min: 0,
            max: 50,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.discCoreIntensity = v;
                this._emit();
            }
        });
        this._controls.discCoreSigmaDeg = makeNumberSliderRow({
            label: 'Disc core size (σ °)',
            value: this._draft.discCoreSigmaDeg ?? 0.06,
            min: 0.02,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.discCoreSigmaDeg = v;
                this._emit();
            }
        });

        sectionSky.appendChild(this._controls.skyBgMode.row);
        sectionSky.appendChild(this._controls.skyDebugMode.row);
        sectionSky.appendChild(this._controls.skySunRing.row);
        sectionSky.appendChild(this._controls.skyHorizonColor.row);
        sectionSky.appendChild(this._controls.skyZenithColor.row);
        sectionSky.appendChild(this._controls.skyGroundColor.row);
        sectionSky.appendChild(this._controls.skyExposure.row);
        sectionSky.appendChild(this._controls.skyCurve.row);
        sectionSky.appendChild(this._controls.skyDither.row);
        sectionSky.appendChild(this._controls.hazeEnabled.row);
        sectionSky.appendChild(this._controls.hazeIntensity.row);
        sectionSky.appendChild(this._controls.hazeThickness.row);
        sectionSky.appendChild(this._controls.hazeCurve.row);
        sectionSky.appendChild(this._controls.glareEnabled.row);
        sectionSky.appendChild(this._controls.glareIntensity.row);
        sectionSky.appendChild(this._controls.glareSigmaDeg.row);
        sectionSky.appendChild(this._controls.glarePower.row);
        sectionSky.appendChild(this._controls.discEnabled.row);
        sectionSky.appendChild(this._controls.discIntensity.row);
        sectionSky.appendChild(this._controls.discSigmaDeg.row);
        sectionSky.appendChild(this._controls.discCoreIntensity.row);
        sectionSky.appendChild(this._controls.discCoreSigmaDeg.row);

        this._tabAtmosphereEl.appendChild(sectionEnv);
        this._tabAtmosphereEl.appendChild(sectionLight);
        this._tabAtmosphereEl.appendChild(sectionSunDir);
        this._tabAtmosphereEl.appendChild(sectionSky);

        const note = makeEl(
            'div',
            'sunbloom-tool-note',
            'Tip: For occlusion testing, the Sun Bloom tab uses a physical sun disc mesh so the occluder can block it.\nDisable the sky sun disc if you see a double-sun.'
        );
        this._tabAtmosphereEl.appendChild(note);
    }

    _buildSunBloomTab() {
        const sectionVar = makeEl('div', 'options-section');
        sectionVar.appendChild(makeEl('div', 'options-section-title', 'Variation'));

        this._controls.sunBloomVariationA = makeSelectRow({
            label: 'Variation A',
            value: this._draft.sunBloomVariationA ?? 'baseline',
            options: [
                { id: 'baseline', label: 'Baseline (no bloom)' },
                { id: 'selective', label: 'Selective bloom (sun-only)' },
                { id: 'analytic_glare', label: 'Analytic glare (sky shader)' },
                { id: 'occlusion', label: 'Occlusion-aware bloom' }
            ],
            onChange: (id) => {
                this._draft.sunBloomVariationA = id;
                this._emit();
            }
        });

        this._controls.sunBloomVariationB = makeSelectRow({
            label: 'Variation B',
            value: this._draft.sunBloomVariationB ?? 'occlusion',
            options: [
                { id: 'baseline', label: 'Baseline (no bloom)' },
                { id: 'selective', label: 'Selective bloom (sun-only)' },
                { id: 'analytic_glare', label: 'Analytic glare (sky shader)' },
                { id: 'occlusion', label: 'Occlusion-aware bloom' }
            ],
            onChange: (id) => {
                this._draft.sunBloomVariationB = id;
                this._emit();
            }
        });

        this._controls.sunBloomCompareEnabled = makeToggleRow({
            label: 'A/B compare enabled',
            value: this._draft.sunBloomCompareEnabled ?? true,
            onChange: (v) => {
                this._draft.sunBloomCompareEnabled = v;
                this._emit();
            }
        });

        this._controls.sunBloomToggleCompare = makeButtonRow({
            label: 'Toggle A/B',
            text: 'Toggle (C)',
            onClick: () => {
                this._draft.sunBloomToggleRequested = (this._draft.sunBloomToggleRequested ?? 0) + 1;
                this._emit();
            }
        });

        sectionVar.appendChild(this._controls.sunBloomVariationA.row);
        sectionVar.appendChild(this._controls.sunBloomVariationB.row);
        sectionVar.appendChild(this._controls.sunBloomCompareEnabled.row);
        sectionVar.appendChild(this._controls.sunBloomToggleCompare.row);

        const sectionBloom = makeEl('div', 'options-section');
        sectionBloom.appendChild(makeEl('div', 'options-section-title', 'Sun-only Bloom'));

        this._controls.sunBloomEnabled = makeToggleRow({
            label: 'Bloom enabled',
            value: this._draft.sunBloomEnabled ?? true,
            onChange: (v) => {
                this._draft.sunBloomEnabled = v;
                this._emit();
            }
        });

        this._controls.sunBloomStrength = makeNumberSliderRow({
            label: 'Bloom strength',
            value: this._draft.sunBloomStrength ?? 0.9,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunBloomStrength = v;
                this._emit();
            }
        });

        this._controls.sunBloomRadius = makeNumberSliderRow({
            label: 'Bloom radius',
            value: this._draft.sunBloomRadius ?? 0.25,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunBloomRadius = v;
                this._emit();
            }
        });

        this._controls.sunBloomThreshold = makeNumberSliderRow({
            label: 'Bloom threshold',
            value: this._draft.sunBloomThreshold ?? 1.05,
            min: 0,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunBloomThreshold = v;
                this._emit();
            }
        });

        this._controls.sunBloomBrightnessOnly = makeToggleRow({
            label: 'Brightness-only composite',
            value: this._draft.sunBloomBrightnessOnly ?? true,
            onChange: (v) => {
                this._draft.sunBloomBrightnessOnly = v;
                this._emit();
            }
        });

        this._controls.sunBloomShowEmitter = makeToggleRow({
            label: 'Show sun disc mesh',
            value: this._draft.sunBloomShowEmitter ?? true,
            onChange: (v) => {
                this._draft.sunBloomShowEmitter = v;
                this._emit();
            }
        });

        this._controls.sunDiscRadiusDeg = makeNumberSliderRow({
            label: 'Disc radius (°)',
            value: this._draft.sunDiscRadiusDeg ?? 0.55,
            min: 0.05,
            max: 6,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunDiscRadiusDeg = v;
                this._emit();
            }
        });

        this._controls.sunDiscIntensity = makeNumberSliderRow({
            label: 'Disc intensity',
            value: this._draft.sunDiscIntensity ?? 25,
            min: 0,
            max: 200,
            step: 0.1,
            digits: 1,
            onChange: (v) => {
                this._draft.sunDiscIntensity = v;
                this._emit();
            }
        });

        this._controls.sunDiscFalloff = makeNumberSliderRow({
            label: 'Disc falloff',
            value: this._draft.sunDiscFalloff ?? 2.2,
            min: 0.5,
            max: 10,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunDiscFalloff = v;
                this._emit();
            }
        });

        this._controls.sunBloomDebugView = makeSelectRow({
            label: 'Debug view',
            value: this._draft.sunBloomDebugView ?? 'final',
            options: [
                { id: 'final', label: 'Final' },
                { id: 'bloom', label: 'Bloom buffer' }
            ],
            onChange: (id) => {
                this._draft.sunBloomDebugView = id;
                this._emit();
            }
        });

        sectionBloom.appendChild(this._controls.sunBloomEnabled.row);
        sectionBloom.appendChild(this._controls.sunBloomStrength.row);
        sectionBloom.appendChild(this._controls.sunBloomRadius.row);
        sectionBloom.appendChild(this._controls.sunBloomThreshold.row);
        sectionBloom.appendChild(this._controls.sunBloomBrightnessOnly.row);
        sectionBloom.appendChild(this._controls.sunBloomShowEmitter.row);
        sectionBloom.appendChild(this._controls.sunDiscRadiusDeg.row);
        sectionBloom.appendChild(this._controls.sunDiscIntensity.row);
        sectionBloom.appendChild(this._controls.sunDiscFalloff.row);
        sectionBloom.appendChild(this._controls.sunBloomDebugView.row);

        const sectionRays = makeEl('div', 'options-section');
        sectionRays.appendChild(makeEl('div', 'options-section-title', 'Sun Rays (Starburst)'));

        this._controls.sunRaysEnabled = makeToggleRow({
            label: 'Rays enabled',
            value: this._draft.sunRaysEnabled ?? true,
            onChange: (v) => {
                this._draft.sunRaysEnabled = v;
                this._emit();
            }
        });

        this._controls.sunRaysIntensity = makeNumberSliderRow({
            label: 'Rays intensity',
            value: this._draft.sunRaysIntensity ?? 0.85,
            min: 0,
            max: 6,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunRaysIntensity = v;
                this._emit();
            }
        });

        this._controls.sunRaysSizePx = makeNumberSliderRow({
            label: 'Rays size (px)',
            value: this._draft.sunRaysSizePx ?? 950,
            min: 64,
            max: 2400,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.sunRaysSizePx = v;
                this._emit();
            }
        });

        this._controls.sunRaysCount = makeNumberSliderRow({
            label: 'Ray count',
            value: this._draft.sunRaysCount ?? 48,
            min: 3,
            max: 256,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.sunRaysCount = v;
                this._emit();
            }
        });

        this._controls.sunRaysLength = makeNumberSliderRow({
            label: 'Ray length',
            value: this._draft.sunRaysLength ?? 0.95,
            min: 0,
            max: 1.6,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunRaysLength = v;
                this._emit();
            }
        });

        this._controls.sunRaysLengthJitter = makeNumberSliderRow({
            label: 'Length jitter',
            value: this._draft.sunRaysLengthJitter ?? 0.45,
            min: 0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunRaysLengthJitter = v;
                this._emit();
            }
        });

        this._controls.sunRaysBaseWidthDeg = makeNumberSliderRow({
            label: 'Base width (°)',
            value: this._draft.sunRaysBaseWidthDeg ?? 1.6,
            min: 0,
            max: 12,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunRaysBaseWidthDeg = v;
                this._emit();
            }
        });

        this._controls.sunRaysTipWidthDeg = makeNumberSliderRow({
            label: 'Tip width (°)',
            value: this._draft.sunRaysTipWidthDeg ?? 0.28,
            min: 0,
            max: 12,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunRaysTipWidthDeg = v;
                this._emit();
            }
        });

        this._controls.sunRaysSoftnessDeg = makeNumberSliderRow({
            label: 'Softness (°)',
            value: this._draft.sunRaysSoftnessDeg ?? 0.9,
            min: 0,
            max: 12,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunRaysSoftnessDeg = v;
                this._emit();
            }
        });

        this._controls.sunRaysCoreGlow = makeNumberSliderRow({
            label: 'Core glow',
            value: this._draft.sunRaysCoreGlow ?? 0.35,
            min: 0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunRaysCoreGlow = v;
                this._emit();
            }
        });

        this._controls.sunRaysOuterGlow = makeNumberSliderRow({
            label: 'Outer glow',
            value: this._draft.sunRaysOuterGlow ?? 0.18,
            min: 0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.sunRaysOuterGlow = v;
                this._emit();
            }
        });

        this._controls.sunRaysRotationDeg = makeNumberSliderRow({
            label: 'Rotation (°)',
            value: this._draft.sunRaysRotationDeg ?? 0,
            min: -360,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.sunRaysRotationDeg = v;
                this._emit();
            }
        });

        sectionRays.appendChild(this._controls.sunRaysEnabled.row);
        sectionRays.appendChild(this._controls.sunRaysIntensity.row);
        sectionRays.appendChild(this._controls.sunRaysSizePx.row);
        sectionRays.appendChild(this._controls.sunRaysCount.row);
        sectionRays.appendChild(this._controls.sunRaysLength.row);
        sectionRays.appendChild(this._controls.sunRaysLengthJitter.row);
        sectionRays.appendChild(this._controls.sunRaysBaseWidthDeg.row);
        sectionRays.appendChild(this._controls.sunRaysTipWidthDeg.row);
        sectionRays.appendChild(this._controls.sunRaysSoftnessDeg.row);
        sectionRays.appendChild(this._controls.sunRaysCoreGlow.row);
        sectionRays.appendChild(this._controls.sunRaysOuterGlow.row);
        sectionRays.appendChild(this._controls.sunRaysRotationDeg.row);

        const sectionOcc = makeEl('div', 'options-section');
        sectionOcc.appendChild(makeEl('div', 'options-section-title', 'Occluder Harness'));

        this._controls.occluderEnabled = makeToggleRow({
            label: 'Occluder enabled',
            value: this._draft.occluderEnabled ?? true,
            onChange: (v) => {
                this._draft.occluderEnabled = v;
                this._emit();
            }
        });

        this._controls.occluderOffsetX = makeNumberSliderRow({
            label: 'Offset X (NDC)',
            value: this._draft.occluderOffsetX ?? 0,
            min: -1,
            max: 1,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                this._draft.occluderOffsetX = v;
                this._emit();
            }
        });

        this._controls.occluderOffsetY = makeNumberSliderRow({
            label: 'Offset Y (NDC)',
            value: this._draft.occluderOffsetY ?? 0,
            min: -1,
            max: 1,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                this._draft.occluderOffsetY = v;
                this._emit();
            }
        });

        this._controls.occluderDistance = makeNumberSliderRow({
            label: 'Distance',
            value: this._draft.occluderDistance ?? 60,
            min: 2,
            max: 250,
            step: 0.1,
            digits: 1,
            onChange: (v) => {
                this._draft.occluderDistance = v;
                this._emit();
            }
        });

        this._controls.occluderScale = makeNumberSliderRow({
            label: 'Scale',
            value: this._draft.occluderScale ?? 12,
            min: 0.5,
            max: 80,
            step: 0.1,
            digits: 1,
            onChange: (v) => {
                this._draft.occluderScale = v;
                this._emit();
            }
        });

        this._controls.occluderRotationDeg = makeNumberSliderRow({
            label: 'Rotation (°)',
            value: this._draft.occluderRotationDeg ?? 0,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.occluderRotationDeg = v;
                this._emit();
            }
        });

        this._controls.occluderPresets = makeActionRow({
            label: 'Presets',
            actions: [
                {
                    label: 'Center',
                    onClick: () => {
                        this._draft.occluderOffsetX = 0;
                        this._draft.occluderOffsetY = 0;
                        this._emit();
                        this.setDraft(this._draft);
                    }
                },
                {
                    label: 'Partial',
                    onClick: () => {
                        this._draft.occluderOffsetX = 0.07;
                        this._draft.occluderOffsetY = -0.03;
                        this._emit();
                        this.setDraft(this._draft);
                    }
                }
            ]
        });

        sectionOcc.appendChild(this._controls.occluderEnabled.row);
        sectionOcc.appendChild(this._controls.occluderOffsetX.row);
        sectionOcc.appendChild(this._controls.occluderOffsetY.row);
        sectionOcc.appendChild(this._controls.occluderDistance.row);
        sectionOcc.appendChild(this._controls.occluderScale.row);
        sectionOcc.appendChild(this._controls.occluderRotationDeg.row);
        sectionOcc.appendChild(this._controls.occluderPresets.row);

        const sectionCam = makeEl('div', 'options-section');
        sectionCam.appendChild(makeEl('div', 'options-section-title', 'Camera Presets'));
        this._controls.cameraPreset = makeSelectRow({
            label: 'Preset',
            value: this._draft.cameraPreset ?? 'default',
            options: [
                { id: 'default', label: 'Default' },
                { id: 'low', label: 'Low angle' },
                { id: 'tele', label: 'Telephoto' }
            ],
            onChange: (id) => {
                this._draft.cameraPreset = id;
                this._emit();
            }
        });
        this._controls.applyCameraPreset = makeButtonRow({
            label: 'Apply',
            text: 'Apply',
            onClick: () => {
                this._draft.cameraPresetApplyRequested = (this._draft.cameraPresetApplyRequested ?? 0) + 1;
                this._emit();
            }
        });
        sectionCam.appendChild(this._controls.cameraPreset.row);
        sectionCam.appendChild(this._controls.applyCameraPreset.row);

        const note = makeEl(
            'div',
            'sunbloom-tool-note',
            'Quick check:\n- Confirm global scene does NOT bloom (only the sun layer adds spill).\n- In Occlusion-aware bloom, move the occluder to barely cover the sun: bloom spill should hug the silhouette edge.\n- In Selective bloom (sun-only), bloom should ignore occlusion.\n- In Analytic glare, sky hue stays stable (multiplicative glare).\n- Use Debug view → Bloom buffer to validate what is contributing.'
        );

        this._tabSunBloomEl.appendChild(sectionVar);
        this._tabSunBloomEl.appendChild(sectionBloom);
        this._tabSunBloomEl.appendChild(sectionRays);
        this._tabSunBloomEl.appendChild(sectionOcc);
        this._tabSunBloomEl.appendChild(sectionCam);
        this._tabSunBloomEl.appendChild(note);
    }

    mount(parent = document.body) {
        parent.appendChild(this.root);
        parent.appendChild(this.hud);
    }

    destroy() {
        window.removeEventListener('keydown', this._onHudToggleKeyDown);
        this.root?.remove?.();
        this.hud?.remove?.();
    }

    _emit() {
        if (this._isSetting) return;
        const payload = { ...this._draft };
        this._onChange?.(payload);
    }

    setTab(tab) {
        const next = tab === 'atmosphere' ? 'atmosphere' : 'sun_bloom';
        this._tab = next;
        this.tabAtmosphereBtn.classList.toggle('is-active', next === 'atmosphere');
        this.tabSunBloomBtn.classList.toggle('is-active', next === 'sun_bloom');
        this._tabAtmosphereEl.classList.toggle('is-active', next === 'atmosphere');
        this._tabSunBloomEl.classList.toggle('is-active', next === 'sun_bloom');
    }

    setDraft(next) {
        if (!next || typeof next !== 'object') return;
        this._isSetting = true;
        this._draft = { ...this._draft, ...next };
        const d = this._draft;

        if (this._controls.iblId?.select) this._controls.iblId.select.value = String(d.iblId ?? '');
        if (this._controls.iblEnabled?.toggle) this._controls.iblEnabled.toggle.checked = !!d.iblEnabled;
        if (this._controls.backgroundEnabled?.toggle) this._controls.backgroundEnabled.toggle.checked = !!d.backgroundEnabled;
        if (this._controls.skyBgMode?.select) this._controls.skyBgMode.select.value = String(d.skyBgMode ?? 'ibl');
        if (this._controls.skyDebugMode?.select) this._controls.skyDebugMode.select.value = String(d.skyDebugMode ?? 'full');
        if (this._controls.skySunRing?.toggle) this._controls.skySunRing.toggle.checked = !!d.skySunRing;
        if (this._controls.hazeEnabled?.toggle) this._controls.hazeEnabled.toggle.checked = !!d.hazeEnabled;
        if (this._controls.glareEnabled?.toggle) this._controls.glareEnabled.toggle.checked = !!d.glareEnabled;
        if (this._controls.discEnabled?.toggle) this._controls.discEnabled.toggle.checked = !!d.discEnabled;

        if (this._controls.sunBloomVariationA?.select) this._controls.sunBloomVariationA.select.value = String(d.sunBloomVariationA ?? 'baseline');
        if (this._controls.sunBloomVariationB?.select) this._controls.sunBloomVariationB.select.value = String(d.sunBloomVariationB ?? 'occlusion');
        if (this._controls.sunBloomCompareEnabled?.toggle) this._controls.sunBloomCompareEnabled.toggle.checked = !!d.sunBloomCompareEnabled;
        if (this._controls.sunBloomEnabled?.toggle) this._controls.sunBloomEnabled.toggle.checked = !!d.sunBloomEnabled;
        if (this._controls.sunBloomBrightnessOnly?.toggle) this._controls.sunBloomBrightnessOnly.toggle.checked = !!d.sunBloomBrightnessOnly;
        if (this._controls.sunBloomShowEmitter?.toggle) this._controls.sunBloomShowEmitter.toggle.checked = !!d.sunBloomShowEmitter;
        if (this._controls.sunRaysEnabled?.toggle) this._controls.sunRaysEnabled.toggle.checked = !!d.sunRaysEnabled;
        if (this._controls.occluderEnabled?.toggle) this._controls.occluderEnabled.toggle.checked = !!d.occluderEnabled;
        if (this._controls.sunBloomDebugView?.select) this._controls.sunBloomDebugView.select.value = String(d.sunBloomDebugView ?? 'final');
        if (this._controls.cameraPreset?.select) this._controls.cameraPreset.select.value = String(d.cameraPreset ?? 'default');

        const setColor = (ctrl, value) => {
            if (!ctrl?.color || !ctrl?.text) return;
            const normalized = normalizeHexColor(value) ?? '#FFFFFF';
            ctrl.color.value = normalized;
            ctrl.text.value = normalized;
        };
        setColor(this._controls.skyHorizonColor, d.skyHorizonColor);
        setColor(this._controls.skyZenithColor, d.skyZenithColor);
        setColor(this._controls.skyGroundColor, d.skyGroundColor);

        const setSlider = (ctrl, value) => {
            if (!ctrl?.range || !ctrl?.number) return;
            ctrl.range.value = String(value);
            ctrl.number.value = String(value);
        };
        setSlider(this._controls.envMapIntensity, clamp(d.envMapIntensity ?? 0.25, 0, 5).toFixed?.(2) ?? 0.25);
        setSlider(this._controls.exposure, clamp(d.exposure ?? 1.6, 0.1, 5).toFixed?.(2) ?? 1.6);
        setSlider(this._controls.sunIntensity, clamp(d.sunIntensity ?? 1.2, 0, 10).toFixed?.(2) ?? 1.2);
        setSlider(this._controls.hemiIntensity, clamp(d.hemiIntensity ?? 0.85, 0, 5).toFixed?.(2) ?? 0.85);
        setSlider(this._controls.sunAzimuthDeg, clamp(d.sunAzimuthDeg ?? 45, 0, 360).toFixed?.(0) ?? 45);
        setSlider(this._controls.sunElevationDeg, clamp(d.sunElevationDeg ?? 35, 0, 89).toFixed?.(0) ?? 35);
        setSlider(this._controls.skyExposure, clamp(d.skyExposure ?? 1.0, 0, 8).toFixed?.(2) ?? 1.0);
        setSlider(this._controls.skyCurve, clamp(d.skyCurve ?? 1.0, 0.05, 8).toFixed?.(2) ?? 1.0);
        setSlider(this._controls.skyDither, clamp(d.skyDither ?? 0.85, 0, 2).toFixed?.(2) ?? 0.85);
        setSlider(this._controls.hazeIntensity, clamp(d.hazeIntensity ?? 0.22, 0, 4).toFixed?.(2) ?? 0.22);
        setSlider(this._controls.hazeThickness, clamp(d.hazeThickness ?? 0.22, 0.02, 1).toFixed?.(2) ?? 0.22);
        setSlider(this._controls.hazeCurve, clamp(d.hazeCurve ?? 1.6, 0.1, 8).toFixed?.(2) ?? 1.6);
        setSlider(this._controls.glareIntensity, clamp(d.glareIntensity ?? 0.95, 0, 20).toFixed?.(2) ?? 0.95);
        setSlider(this._controls.glareSigmaDeg, clamp(d.glareSigmaDeg ?? 10, 0.25, 60).toFixed?.(2) ?? 10);
        setSlider(this._controls.glarePower, clamp(d.glarePower ?? 1.0, 0.2, 6).toFixed?.(2) ?? 1.0);
        setSlider(this._controls.discIntensity, clamp(d.discIntensity ?? 4.0, 0, 50).toFixed?.(2) ?? 4.0);
        setSlider(this._controls.discSigmaDeg, clamp(d.discSigmaDeg ?? 0.22, 0.05, 5).toFixed?.(2) ?? 0.22);
        setSlider(this._controls.discCoreIntensity, clamp(d.discCoreIntensity ?? 2.5, 0, 50).toFixed?.(2) ?? 2.5);
        setSlider(this._controls.discCoreSigmaDeg, clamp(d.discCoreSigmaDeg ?? 0.06, 0.02, 5).toFixed?.(2) ?? 0.06);

        setSlider(this._controls.sunBloomStrength, clamp(d.sunBloomStrength ?? 0.9, 0, 5).toFixed?.(2) ?? 0.9);
        setSlider(this._controls.sunBloomRadius, clamp(d.sunBloomRadius ?? 0.25, 0, 1).toFixed?.(2) ?? 0.25);
        setSlider(this._controls.sunBloomThreshold, clamp(d.sunBloomThreshold ?? 1.05, 0, 5).toFixed?.(2) ?? 1.05);
        setSlider(this._controls.sunDiscRadiusDeg, clamp(d.sunDiscRadiusDeg ?? 0.55, 0.05, 6).toFixed?.(2) ?? 0.55);
        setSlider(this._controls.sunDiscIntensity, clamp(d.sunDiscIntensity ?? 25, 0, 200).toFixed?.(1) ?? 25);
        setSlider(this._controls.sunDiscFalloff, clamp(d.sunDiscFalloff ?? 2.2, 0.5, 10).toFixed?.(2) ?? 2.2);
        setSlider(this._controls.sunRaysIntensity, clamp(d.sunRaysIntensity ?? 0.85, 0, 6).toFixed?.(2) ?? 0.85);
        setSlider(this._controls.sunRaysSizePx, clamp(d.sunRaysSizePx ?? 950, 64, 2400).toFixed?.(0) ?? 950);
        setSlider(this._controls.sunRaysCount, clamp(d.sunRaysCount ?? 48, 3, 256).toFixed?.(0) ?? 48);
        setSlider(this._controls.sunRaysLength, clamp(d.sunRaysLength ?? 0.95, 0, 1.6).toFixed?.(2) ?? 0.95);
        setSlider(this._controls.sunRaysLengthJitter, clamp(d.sunRaysLengthJitter ?? 0.45, 0, 1.0).toFixed?.(2) ?? 0.45);
        setSlider(this._controls.sunRaysBaseWidthDeg, clamp(d.sunRaysBaseWidthDeg ?? 1.6, 0, 12).toFixed?.(2) ?? 1.6);
        setSlider(this._controls.sunRaysTipWidthDeg, clamp(d.sunRaysTipWidthDeg ?? 0.28, 0, 12).toFixed?.(2) ?? 0.28);
        setSlider(this._controls.sunRaysSoftnessDeg, clamp(d.sunRaysSoftnessDeg ?? 0.9, 0, 12).toFixed?.(2) ?? 0.9);
        setSlider(this._controls.sunRaysCoreGlow, clamp(d.sunRaysCoreGlow ?? 0.35, 0, 2.0).toFixed?.(2) ?? 0.35);
        setSlider(this._controls.sunRaysOuterGlow, clamp(d.sunRaysOuterGlow ?? 0.18, 0, 2.0).toFixed?.(2) ?? 0.18);
        setSlider(this._controls.sunRaysRotationDeg, clamp(d.sunRaysRotationDeg ?? 0, -360, 360).toFixed?.(0) ?? 0);
        setSlider(this._controls.occluderOffsetX, clamp(d.occluderOffsetX ?? 0, -1, 1).toFixed?.(3) ?? 0);
        setSlider(this._controls.occluderOffsetY, clamp(d.occluderOffsetY ?? 0, -1, 1).toFixed?.(3) ?? 0);
        setSlider(this._controls.occluderDistance, clamp(d.occluderDistance ?? 60, 2, 250).toFixed?.(1) ?? 60);
        setSlider(this._controls.occluderScale, clamp(d.occluderScale ?? 12, 0.5, 80).toFixed?.(1) ?? 12);
        setSlider(this._controls.occluderRotationDeg, clamp(d.occluderRotationDeg ?? 0, -180, 180).toFixed?.(0) ?? 0);

        this._isSetting = false;
    }

    setHudText(text) {
        this.hudLines.textContent = String(text ?? '');
    }

    isHudVisible() {
        return !this.hud.classList.contains('is-hidden');
    }

    setHudVisible(visible) {
        this.hud.classList.toggle('is-hidden', !visible);
    }
}
