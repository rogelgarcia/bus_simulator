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
