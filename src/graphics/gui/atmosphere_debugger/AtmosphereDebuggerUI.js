// src/graphics/gui/atmosphere_debugger/AtmosphereDebuggerUI.js
// Docked Options-style panel for the Atmosphere Debug tool.

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
    const btn = makeEl('button', 'atmo-action-btn', text);
    btn.type = 'button';
    btn.addEventListener('click', () => onClick?.());
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    return { row, btn };
}

function makePresetRow({ onPreset }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', 'Presets');
    const right = makeEl('div', 'options-row-control options-row-control-wide');
    const wrap = makeEl('div', 'atmo-preset-row');

    const makeBtn = (id, label) => {
        const btn = makeEl('button', 'atmo-preset-btn', label);
        btn.type = 'button';
        btn.addEventListener('click', () => onPreset?.(id));
        return btn;
    };

    wrap.appendChild(makeBtn('noon', 'Noon'));
    wrap.appendChild(makeBtn('golden', 'Golden'));
    wrap.appendChild(makeBtn('overcast', 'Overcast'));

    right.appendChild(wrap);
    row.appendChild(left);
    row.appendChild(right);
    return { row, wrap };
}

export class AtmosphereDebuggerUI {
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

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-atmosphere-debug-options';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const title = makeEl('div', 'options-title', 'Atmosphere Debug');
        const subtitle = makeEl('div', 'options-subtitle', 'RMB orbit · MMB pan · Wheel zoom · F frame · R reset');
        header.appendChild(title);
        header.appendChild(subtitle);

        this.body = makeEl('div', 'options-body');

        const sectionEnv = makeEl('div', 'options-section');
        sectionEnv.appendChild(makeEl('div', 'options-section-title', 'Environment'));
        this._controls = {
            iblId: makeSelectRow({
                label: 'HDRI',
                value: this._draft.iblId ?? '',
                options: iblOptions ?? [],
                onChange: (id) => {
                    this._draft.iblId = id;
                    this._emit();
                }
            }),
            iblEnabled: makeToggleRow({
                label: 'IBL enabled',
                value: this._draft.iblEnabled ?? false,
                onChange: (v) => {
                    this._draft.iblEnabled = v;
                    this._emit();
                }
            }),
            backgroundEnabled: makeToggleRow({
                label: 'HDR background',
                value: this._draft.backgroundEnabled ?? true,
                onChange: (v) => {
                    this._draft.backgroundEnabled = v;
                    this._emit();
                }
            }),
            envMapIntensity: makeNumberSliderRow({
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
            })
        };
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
            value: this._draft.skyGroundColor ?? (this._draft.skyHorizonColor ?? '#EAF9FF'),
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
            label: 'Sun disc',
            value: this._draft.discEnabled ?? true,
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

        const sectionPresets = makeEl('div', 'options-section');
        sectionPresets.appendChild(makeEl('div', 'options-section-title', 'Presets'));
        this._controls.presets = makePresetRow({ onPreset: (id) => this.applyPreset(id) });
        sectionPresets.appendChild(this._controls.presets.row);

        const note = makeEl(
            'div',
            'atmo-tool-note',
            'No game runtime/state machine. This tool renders an isolated look-dev scene.'
        );

        this.body.appendChild(sectionEnv);
        this.body.appendChild(sectionLight);
        this.body.appendChild(sectionSunDir);
        this.body.appendChild(sectionSky);
        this.body.appendChild(sectionPresets);
        this.body.appendChild(note);

        this.panel.appendChild(header);
        this.panel.appendChild(this.body);
        this.root.appendChild(this.panel);

        this.hud = makeEl('div', 'ui-panel atmo-hud');
        this.hud.id = 'ui-atmo-hud';
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

        this._isSetting = false;
    }

    applyPreset(presetId) {
        const id = String(presetId ?? '');
        if (id === 'golden') {
            this._draft.exposure = 1.75;
            this._draft.sunIntensity = 0.8;
            this._draft.hemiIntensity = 0.55;
            this._draft.envMapIntensity = 0.3;
        } else if (id === 'overcast') {
            this._draft.exposure = 1.9;
            this._draft.sunIntensity = 0.18;
            this._draft.hemiIntensity = 1.2;
            this._draft.envMapIntensity = 0.38;
        } else {
            this._draft.exposure = 1.6;
            this._draft.sunIntensity = 1.2;
            this._draft.hemiIntensity = 0.85;
            this._draft.envMapIntensity = 0.25;
        }
        this.setDraft(this._draft);
        this._emit();
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
