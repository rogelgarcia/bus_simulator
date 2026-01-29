// src/graphics/gui/markings_aa_debugger/MarkingsAADebuggerUI.js
// Docked panel for the Markings AA Debugger tool.
// @ts-check

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

function makeTextRow({ label, value = '', placeholder = '', onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const input = document.createElement('input');
    input.type = 'text';
    input.value = String(value ?? '');
    input.placeholder = String(placeholder ?? '');
    input.className = 'options-number';
    input.style.width = '220px';
    input.style.textAlign = 'left';

    input.addEventListener('change', () => onChange?.(String(input.value)));
    input.addEventListener('blur', () => onChange?.(String(input.value)));

    right.appendChild(input);
    row.appendChild(left);
    row.appendChild(right);
    return { row, input };
}

function makeButtonRow({ label, text, onClick }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const btn = makeEl('button', 'options-btn options-btn-primary', text);
    btn.type = 'button';
    btn.addEventListener('click', () => onClick?.());

    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    return { row, btn };
}

function titleCase(id) {
    const raw = typeof id === 'string' ? id.trim() : '';
    if (!raw) return '';
    return raw.split(/[_-]+/g).filter(Boolean).map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function getModeId(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'none') return 'off';
    return raw || 'off';
}

export class MarkingsAADebuggerUI {
    constructor({
        initialSettings = null,
        initialAntiAliasing = null,
        aaModeOptions = null,
        onChange = null,
        onReroll = null
    } = {}) {
        this._draft = {
            settings: initialSettings && typeof initialSettings === 'object' ? { ...initialSettings } : {},
            antiAliasing: initialAntiAliasing && typeof initialAntiAliasing === 'object' ? { ...initialAntiAliasing } : {}
        };

        this._aaModeOptions = Array.isArray(aaModeOptions) ? aaModeOptions : [];
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onReroll = typeof onReroll === 'function' ? onReroll : null;
        this._isSetting = false;

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-markings-aa-debug-options';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        header.appendChild(makeEl('div', 'options-title', 'Markings AA Debugger'));
        header.appendChild(makeEl('div', 'options-subtitle', 'RMB orbit · MMB pan · Wheel zoom · F frame · R reset · Arrow keys move · Esc back'));

        this.body = makeEl('div', 'options-body');

        this._controls = {};
        this._sections = {};

        const sectionView = makeEl('div', 'options-section');
        sectionView.appendChild(makeEl('div', 'options-section-title', 'View'));
        this._controls.viewMode = makeChoiceRow({
            label: 'Mode',
            value: this._draft.settings.viewMode ?? 'normal',
            options: [
                { id: 'normal', label: 'Normal scene' },
                { id: 'depth', label: 'Depth buffer' },
                { id: 'markings', label: 'Markings buffer' },
                { id: 'composite', label: 'Composite (scene + markings)' }
            ],
            onChange: (id) => {
                this._draft.settings.viewMode = getModeId(id);
                this._syncVisibility();
                this._emit();
            }
        });
        this._controls.depthRangeMeters = makeNumberSliderRow({
            label: 'Depth range (m)',
            value: this._draft.settings.depthVizRangeMeters ?? 200,
            min: 5,
            max: 5000,
            step: 5,
            digits: 0,
            onChange: (v) => {
                this._draft.settings.depthVizRangeMeters = v;
                this._emit();
            }
        });
        this._controls.depthPower = makeNumberSliderRow({
            label: 'Depth curve',
            value: this._draft.settings.depthVizPower ?? 1.6,
            min: 0.25,
            max: 8,
            step: 0.05,
            digits: 2,
            onChange: (v) => {
                this._draft.settings.depthVizPower = v;
                this._emit();
            }
        });
        this._controls.markingsVizBg = makeColorRow({
            label: 'Markings BG',
            value: this._draft.settings.markingsVizBackgroundColor ?? '#2A2F36',
            onChange: (hex) => {
                this._draft.settings.markingsVizBackgroundColor = hex;
                this._emit();
            }
        });
        sectionView.appendChild(this._controls.viewMode.row);
        sectionView.appendChild(this._controls.depthRangeMeters.row);
        sectionView.appendChild(this._controls.depthPower.row);
        sectionView.appendChild(this._controls.markingsVizBg.row);
        this._sections.view = sectionView;

        const sectionAa = makeEl('div', 'options-section');
        sectionAa.appendChild(makeEl('div', 'options-section-title', 'Anti-Aliasing'));
        const aaModeOptionsResolved = this._aaModeOptions.length
            ? this._aaModeOptions
            : [
                { id: 'off', label: 'Off' },
                { id: 'msaa', label: 'MSAA' },
                { id: 'taa', label: 'TAA' },
                { id: 'smaa', label: 'SMAA' },
                { id: 'fxaa', label: 'FXAA' }
            ];
        this._controls.aaMode = makeChoiceRow({
            label: 'Mode',
            value: this._draft.antiAliasing.mode ?? 'msaa',
            options: aaModeOptionsResolved,
            onChange: (id) => {
                this._draft.antiAliasing.mode = getModeId(id);
                this._syncVisibility();
                this._emit();
            }
        });
        sectionAa.appendChild(this._controls.aaMode.row);

        this._sections.aa = sectionAa;

        this._sections.msaa = makeEl('div', 'options-section');
        this._sections.msaa.appendChild(makeEl('div', 'options-section-title', 'MSAA'));
        this._controls.msaaSamples = makeChoiceRow({
            label: 'Samples',
            value: String(this._draft.antiAliasing?.msaa?.samples ?? 2),
            options: [
                { id: '2', label: '2×' },
                { id: '4', label: '4×' },
                { id: '8', label: '8×' }
            ],
            onChange: (id) => {
                this._draft.antiAliasing.msaa = this._draft.antiAliasing.msaa ?? {};
                this._draft.antiAliasing.msaa.samples = Number(id);
                this._emit();
            }
        });
        this._sections.msaa.appendChild(this._controls.msaaSamples.row);

        this._sections.taa = makeEl('div', 'options-section');
        this._sections.taa.appendChild(makeEl('div', 'options-section-title', 'TAA'));
        this._controls.taaPreset = makeChoiceRow({
            label: 'Preset',
            value: this._draft.antiAliasing?.taa?.preset ?? 'high',
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' },
                { id: 'ultra', label: 'Ultra' },
                { id: 'custom', label: 'Custom' }
            ],
            onChange: (id) => {
                this._draft.antiAliasing.taa = this._draft.antiAliasing.taa ?? {};
                this._draft.antiAliasing.taa.preset = id;
                this._emit();
            }
        });
        this._controls.taaHistoryStrength = makeNumberSliderRow({
            label: 'History',
            value: this._draft.antiAliasing?.taa?.historyStrength ?? 0.9,
            min: 0,
            max: 0.98,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.antiAliasing.taa = this._draft.antiAliasing.taa ?? {};
                this._draft.antiAliasing.taa.historyStrength = v;
                this._emit();
            }
        });
        this._controls.taaJitter = makeNumberSliderRow({
            label: 'Jitter',
            value: this._draft.antiAliasing?.taa?.jitter ?? 1.0,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.antiAliasing.taa = this._draft.antiAliasing.taa ?? {};
                this._draft.antiAliasing.taa.jitter = v;
                this._emit();
            }
        });
        this._controls.taaSharpen = makeNumberSliderRow({
            label: 'Sharpen',
            value: this._draft.antiAliasing?.taa?.sharpen ?? 0.15,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.antiAliasing.taa = this._draft.antiAliasing.taa ?? {};
                this._draft.antiAliasing.taa.sharpen = v;
                this._emit();
            }
        });
        this._controls.taaClampStrength = makeNumberSliderRow({
            label: 'Clamp',
            value: this._draft.antiAliasing?.taa?.clampStrength ?? 0.8,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.antiAliasing.taa = this._draft.antiAliasing.taa ?? {};
                this._draft.antiAliasing.taa.clampStrength = v;
                this._emit();
            }
        });
        this._sections.taa.appendChild(this._controls.taaPreset.row);
        this._sections.taa.appendChild(this._controls.taaHistoryStrength.row);
        this._sections.taa.appendChild(this._controls.taaJitter.row);
        this._sections.taa.appendChild(this._controls.taaSharpen.row);
        this._sections.taa.appendChild(this._controls.taaClampStrength.row);

        this._sections.smaa = makeEl('div', 'options-section');
        this._sections.smaa.appendChild(makeEl('div', 'options-section-title', 'SMAA'));
        this._controls.smaaPreset = makeChoiceRow({
            label: 'Preset',
            value: this._draft.antiAliasing?.smaa?.preset ?? 'medium',
            options: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' },
                { id: 'ultra', label: 'Ultra' },
                { id: 'custom', label: 'Custom' }
            ],
            onChange: (id) => {
                this._draft.antiAliasing.smaa = this._draft.antiAliasing.smaa ?? {};
                this._draft.antiAliasing.smaa.preset = id;
                this._emit();
            }
        });
        this._controls.smaaThreshold = makeNumberSliderRow({
            label: 'Threshold',
            value: this._draft.antiAliasing?.smaa?.threshold ?? 0.1,
            min: 0.01,
            max: 0.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.antiAliasing.smaa = this._draft.antiAliasing.smaa ?? {};
                this._draft.antiAliasing.smaa.threshold = v;
                this._emit();
            }
        });
        this._controls.smaaMaxSearchSteps = makeNumberSliderRow({
            label: 'Search',
            value: this._draft.antiAliasing?.smaa?.maxSearchSteps ?? 16,
            min: 4,
            max: 64,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.antiAliasing.smaa = this._draft.antiAliasing.smaa ?? {};
                this._draft.antiAliasing.smaa.maxSearchSteps = Math.round(v);
                this._emit();
            }
        });
        this._controls.smaaMaxSearchStepsDiag = makeNumberSliderRow({
            label: 'Diag',
            value: this._draft.antiAliasing?.smaa?.maxSearchStepsDiag ?? 8,
            min: 0,
            max: 32,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.antiAliasing.smaa = this._draft.antiAliasing.smaa ?? {};
                this._draft.antiAliasing.smaa.maxSearchStepsDiag = Math.round(v);
                this._emit();
            }
        });
        this._controls.smaaCornerRounding = makeNumberSliderRow({
            label: 'Corners',
            value: this._draft.antiAliasing?.smaa?.cornerRounding ?? 25,
            min: 0,
            max: 100,
            step: 1,
            digits: 0,
            onChange: (v) => {
                this._draft.antiAliasing.smaa = this._draft.antiAliasing.smaa ?? {};
                this._draft.antiAliasing.smaa.cornerRounding = Math.round(v);
                this._emit();
            }
        });
        this._sections.smaa.appendChild(this._controls.smaaPreset.row);
        this._sections.smaa.appendChild(this._controls.smaaThreshold.row);
        this._sections.smaa.appendChild(this._controls.smaaMaxSearchSteps.row);
        this._sections.smaa.appendChild(this._controls.smaaMaxSearchStepsDiag.row);
        this._sections.smaa.appendChild(this._controls.smaaCornerRounding.row);

        this._sections.fxaa = makeEl('div', 'options-section');
        this._sections.fxaa.appendChild(makeEl('div', 'options-section-title', 'FXAA'));
        this._controls.fxaaPreset = makeChoiceRow({
            label: 'Preset',
            value: this._draft.antiAliasing?.fxaa?.preset ?? 'balanced',
            options: [
                { id: 'sharp', label: 'Sharp' },
                { id: 'balanced', label: 'Balanced' },
                { id: 'soft', label: 'Soft' },
                { id: 'custom', label: 'Custom' }
            ],
            onChange: (id) => {
                this._draft.antiAliasing.fxaa = this._draft.antiAliasing.fxaa ?? {};
                this._draft.antiAliasing.fxaa.preset = id;
                this._emit();
            }
        });
        this._controls.fxaaEdgeThreshold = makeNumberSliderRow({
            label: 'Edge',
            value: this._draft.antiAliasing?.fxaa?.edgeThreshold ?? 0.2,
            min: 0.02,
            max: 0.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._draft.antiAliasing.fxaa = this._draft.antiAliasing.fxaa ?? {};
                this._draft.antiAliasing.fxaa.edgeThreshold = v;
                this._emit();
            }
        });
        this._sections.fxaa.appendChild(this._controls.fxaaPreset.row);
        this._sections.fxaa.appendChild(this._controls.fxaaEdgeThreshold.row);

        this._sections.aaExtra = makeEl('div', 'options-section');
        this._sections.aaExtra.appendChild(makeEl('div', 'options-section-title', 'AA Mode'));
        this._controls.aaExtraNote = makeEl('div', 'options-note', '');
        this._sections.aaExtra.appendChild(this._controls.aaExtraNote);

        sectionAa.appendChild(this._sections.msaa);
        sectionAa.appendChild(this._sections.taa);
        sectionAa.appendChild(this._sections.smaa);
        sectionAa.appendChild(this._sections.fxaa);
        sectionAa.appendChild(this._sections.aaExtra);

        const sectionMarkings = makeEl('div', 'options-section');
        sectionMarkings.appendChild(makeEl('div', 'options-section-title', 'Markings Buffer'));
        this._controls.markingsScale = makeNumberSliderRow({
            label: 'Scale',
            value: this._draft.settings.markingsBufferScale ?? 2.0,
            min: 1,
            max: 4,
            step: 0.25,
            digits: 2,
            onChange: (v) => {
                this._draft.settings.markingsBufferScale = v;
                this._emit();
            }
        });
        this._controls.markingsSamples = makeChoiceRow({
            label: 'MSAA',
            value: String(this._draft.settings.markingsBufferSamples ?? 4),
            options: [
                { id: '0', label: '0×' },
                { id: '2', label: '2×' },
                { id: '4', label: '4×' },
                { id: '8', label: '8×' }
            ],
            onChange: (id) => {
                this._draft.settings.markingsBufferSamples = Number(id);
                this._emit();
            }
        });
        this._controls.markingsOcclusionBiasMeters = makeNumberSliderRow({
            label: 'Occlusion bias (m)',
            value: this._draft.settings.markingsOcclusionBiasMeters ?? 0.02,
            min: 0,
            max: 0.5,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                this._draft.settings.markingsOcclusionBiasMeters = v;
                this._emit();
            }
        });
        sectionMarkings.appendChild(this._controls.markingsScale.row);
        sectionMarkings.appendChild(this._controls.markingsSamples.row);
        sectionMarkings.appendChild(this._controls.markingsOcclusionBiasMeters.row);

        const sectionSeed = makeEl('div', 'options-section');
        sectionSeed.appendChild(makeEl('div', 'options-section-title', 'Occluders'));
        this._controls.seed = makeTextRow({
            label: 'Seed',
            value: this._draft.settings.seed ?? '',
            placeholder: 'seed',
            onChange: (v) => {
                this._draft.settings.seed = v;
                this._emit();
            }
        });
        this._controls.reroll = makeButtonRow({
            label: 'Re-roll',
            text: 'Re-roll',
            onClick: () => this._onReroll?.()
        });
        sectionSeed.appendChild(this._controls.seed.row);
        sectionSeed.appendChild(this._controls.reroll.row);

        const sectionInfo = makeEl('div', 'options-section');
        sectionInfo.appendChild(makeEl('div', 'options-section-title', 'Info'));
        this._controls.infoResolution = makeValueRow({ label: 'Resolution', value: '-' });
        this._controls.infoPixelRatio = makeValueRow({ label: 'Pixel ratio', value: '-' });
        this._controls.infoMarkings = makeValueRow({ label: 'Markings buffer', value: '-' });
        sectionInfo.appendChild(this._controls.infoResolution.row);
        sectionInfo.appendChild(this._controls.infoPixelRatio.row);
        sectionInfo.appendChild(this._controls.infoMarkings.row);

        this.body.appendChild(sectionView);
        this.body.appendChild(sectionAa);
        this.body.appendChild(sectionMarkings);
        this.body.appendChild(sectionSeed);
        this.body.appendChild(sectionInfo);

        this.panel.appendChild(header);
        this.panel.appendChild(this.body);
        this.root.appendChild(this.panel);

        this._onKeyDown = (e) => {
            if (!e) return;
            if (e.code !== 'Escape' && e.key !== 'Escape') return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
        };
        window.addEventListener('keydown', this._onKeyDown, { passive: false });

        this._syncVisibility();
    }

    mount(parent = document.body) {
        parent.appendChild(this.root);
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        this.root?.remove?.();
    }

    _emit() {
        if (this._isSetting) return;
        this._onChange?.({
            settings: { ...(this._draft.settings ?? {}) },
            antiAliasing: { ...(this._draft.antiAliasing ?? {}) }
        });
    }

    _syncVisibility() {
        const viewMode = getModeId(this._draft.settings.viewMode);
        this._controls.markingsVizBg.row.classList.toggle('hidden', viewMode !== 'markings');
        this._controls.depthRangeMeters.row.classList.toggle('hidden', viewMode !== 'depth');
        this._controls.depthPower.row.classList.toggle('hidden', viewMode !== 'depth');
        this._controls.markingsOcclusionBiasMeters.row.classList.toggle('hidden', viewMode !== 'markings' && viewMode !== 'composite');

        const mode = getModeId(this._draft.antiAliasing.mode);
        const all = ['msaa', 'taa', 'smaa', 'fxaa'];
        for (const id of all) this._sections[id].classList.toggle('hidden', mode !== id);
        const isKnown = all.includes(mode) || mode === 'off';
        this._sections.aaExtra.classList.toggle('hidden', isKnown || mode === 'off');
        if (!isKnown && mode !== 'off') {
            this._controls.aaExtraNote.textContent = `No UI controls for "${titleCase(mode)}".`;
        }
    }

    setDraft({ settings = null, antiAliasing = null } = {}) {
        const s = settings && typeof settings === 'object' ? settings : null;
        const aa = antiAliasing && typeof antiAliasing === 'object' ? antiAliasing : null;
        if (!s && !aa) return;

        this._isSetting = true;
        if (s) this._draft.settings = { ...(this._draft.settings ?? {}), ...s };
        if (aa) this._draft.antiAliasing = { ...(this._draft.antiAliasing ?? {}), ...aa };

        const ds = this._draft.settings ?? {};
        const daa = this._draft.antiAliasing ?? {};

        if (this._controls.viewMode?.setValue) this._controls.viewMode.setValue(String(getModeId(ds.viewMode)));
        if (this._controls.aaMode?.setValue) this._controls.aaMode.setValue(String(getModeId(daa.mode)));
        if (this._controls.seed?.input) this._controls.seed.input.value = String(ds.seed ?? '');

        const setColor = (ctrl, value) => {
            if (!ctrl?.color || !ctrl?.text) return;
            const normalized = normalizeHexColor(value) ?? '#FFFFFF';
            ctrl.color.value = normalized;
            ctrl.text.value = normalized;
        };
        setColor(this._controls.markingsVizBg, ds.markingsVizBackgroundColor);

        const setSlider = (ctrl, value, digits = 2) => {
            if (!ctrl?.range || !ctrl?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            ctrl.range.value = String(v);
            ctrl.number.value = String(v.toFixed(digits));
        };

        setSlider(this._controls.markingsScale, ds.markingsBufferScale ?? 2.0, 2);
        setSlider(this._controls.depthRangeMeters, ds.depthVizRangeMeters ?? 200, 0);
        setSlider(this._controls.depthPower, ds.depthVizPower ?? 1.6, 2);
        setSlider(this._controls.markingsOcclusionBiasMeters, ds.markingsOcclusionBiasMeters ?? 0.02, 3);
        if (this._controls.markingsSamples) this._controls.markingsSamples.setValue(String(ds.markingsBufferSamples ?? 4));

        if (this._controls.msaaSamples) this._controls.msaaSamples.setValue(String(daa?.msaa?.samples ?? 2));

        if (this._controls.taaPreset?.setValue) this._controls.taaPreset.setValue(String(daa?.taa?.preset ?? 'high'));
        setSlider(this._controls.taaHistoryStrength, daa?.taa?.historyStrength ?? 0.9, 2);
        setSlider(this._controls.taaJitter, daa?.taa?.jitter ?? 1.0, 2);
        setSlider(this._controls.taaSharpen, daa?.taa?.sharpen ?? 0.15, 2);
        setSlider(this._controls.taaClampStrength, daa?.taa?.clampStrength ?? 0.8, 2);

        if (this._controls.smaaPreset?.setValue) this._controls.smaaPreset.setValue(String(daa?.smaa?.preset ?? 'medium'));
        setSlider(this._controls.smaaThreshold, daa?.smaa?.threshold ?? 0.1, 2);
        setSlider(this._controls.smaaMaxSearchSteps, daa?.smaa?.maxSearchSteps ?? 16, 0);
        setSlider(this._controls.smaaMaxSearchStepsDiag, daa?.smaa?.maxSearchStepsDiag ?? 8, 0);
        setSlider(this._controls.smaaCornerRounding, daa?.smaa?.cornerRounding ?? 25, 0);

        if (this._controls.fxaaPreset?.setValue) this._controls.fxaaPreset.setValue(String(daa?.fxaa?.preset ?? 'balanced'));
        setSlider(this._controls.fxaaEdgeThreshold, daa?.fxaa?.edgeThreshold ?? 0.2, 2);

        this._syncVisibility();
        this._isSetting = false;
    }

    setInfo({ resolutionText = null, pixelRatioText = null, markingsText = null } = {}) {
        if (this._controls.infoResolution?.text && resolutionText != null) this._controls.infoResolution.text.textContent = String(resolutionText);
        if (this._controls.infoPixelRatio?.text && pixelRatioText != null) this._controls.infoPixelRatio.text.textContent = String(pixelRatioText);
        if (this._controls.infoMarkings?.text && markingsText != null) this._controls.infoMarkings.text.textContent = String(markingsText);
    }
}
