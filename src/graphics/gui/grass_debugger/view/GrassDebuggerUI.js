// src/graphics/gui/grass_debugger/view/GrassDebuggerUI.js
// Docked panel for the Grass Debugger tool.
// @ts-check

import { DEFAULT_IBL_ID, getIblOptions } from '../../../content3d/catalogs/IBLCatalog.js';
import { getPbrMaterialClassSectionsForGround, getPbrMaterialOptionsForGround } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { PROCEDURAL_MESH } from '../../../content3d/catalogs/ProceduralMeshCatalog.js';
import { PickerPopup } from '../../shared/PickerPopup.js';

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj;
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

function normalizeSeed(value) {
    const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    return raw || 'lod';
}

function makeToggleRow({ label, value = false, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const wrap = makeEl('label', 'options-toggle-switch');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!value;
    toggle.className = 'options-toggle';
    toggle.addEventListener('change', () => onChange?.(!!toggle.checked));
    wrap.appendChild(toggle);
    wrap.appendChild(makeEl('span', 'options-toggle-ui'));

    right.appendChild(wrap);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        toggle.title = tooltip;
    }
    return { row, toggle };
}

function makeSelectRow({ label, value = '', options = [], tooltip = '', onChange }) {
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
    if (tooltip) {
        left.title = tooltip;
        select.title = tooltip;
    }
    return { row, select };
}

function makeNumberSliderRow({ label, value = 0, min = 0, max = 1, step = 0.01, digits = 2, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(clamp(value, min, max, value));
    range.className = 'options-range';

    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);
    number.value = String(clamp(value, min, max, value).toFixed(digits));
    number.className = 'options-number';

    const emit = (raw) => {
        const next = clamp(raw, min, max, min);
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
    if (tooltip) {
        left.title = tooltip;
        range.title = tooltip;
        number.title = tooltip;
    }
    return { row, range, number };
}

function makeLogNumberSliderRow({ label, value = 0, min = 0, max = 1, step = 1, digits = 0, sliderStep = 0.0001, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const minVal = Number.isFinite(Number(min)) ? Number(min) : 0;
    const maxVal = Number.isFinite(Number(max)) ? Number(max) : 1;
    const span = Math.max(0, maxVal - minVal);
    const logSpan = Math.log10(span + 1);
    const stepVal = Number(step) > 0 ? Number(step) : 1;

    const quantize = (v) => {
        if (!(stepVal > 0)) return v;
        return Math.round(v / stepVal) * stepVal;
    };

    const valueToT = (v) => {
        const clamped = clamp(v, minVal, maxVal, minVal);
        const off = Math.max(0, clamped - minVal);
        if (!(logSpan > 0)) return 0;
        return clamp(Math.log10(off + 1) / logSpan, 0, 1, 0);
    };

    const tToValue = (t) => {
        const tt = clamp(t, 0, 1, 0);
        if (!(logSpan > 0)) return minVal;
        return clamp(minVal + (Math.pow(10, tt * logSpan) - 1), minVal, maxVal, minVal);
    };

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = String(sliderStep);
    range.className = 'options-range';

    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(minVal);
    number.max = String(maxVal);
    number.step = String(stepVal);
    number.className = 'options-number';

    const applyValue = (raw) => {
        const next = quantize(clamp(raw, minVal, maxVal, minVal));
        range.value = String(valueToT(next));
        number.value = String(next.toFixed(digits));
        return next;
    };

    const emit = (raw) => {
        const next = applyValue(raw);
        onChange?.(next);
    };

    range.addEventListener('input', () => emit(tToValue(Number(range.value))));
    number.addEventListener('input', () => {
        if (number.value === '') return;
        const parsed = Number(number.value);
        if (!Number.isFinite(parsed)) return;
        emit(parsed);
    });

    applyValue(value);

    right.appendChild(range);
    right.appendChild(number);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        range.title = tooltip;
        number.title = tooltip;
    }
    return { row, range, number };
}

function makeSeedRow({ label, value = '', tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'options-number';
    input.value = String(value ?? '');
    input.placeholder = 'seed';

    input.addEventListener('change', () => onChange?.(normalizeSeed(input.value)));
    input.addEventListener('blur', () => onChange?.(normalizeSeed(input.value)));

    right.appendChild(input);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        input.title = tooltip;
    }
    return { row, input };
}

function makeButtonRow({ label, text, tooltip = '', onClick }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');
    const btn = makeEl('button', 'options-btn', text);
    btn.type = 'button';
    btn.addEventListener('click', () => onClick?.());
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        btn.title = tooltip;
    }
    return { row, btn };
}

function setOptionsThumbToTexture(thumb, url, label) {
    if (!thumb) return;
    thumb.textContent = '';
    thumb.classList.remove('has-image');
    thumb.replaceChildren();

    const safeUrl = typeof url === 'string' ? url : '';
    if (safeUrl) {
        const img = document.createElement('img');
        img.className = 'options-material-thumb-img';
        img.alt = typeof label === 'string' ? label : '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            thumb.classList.remove('has-image');
            thumb.textContent = typeof label === 'string' ? label : '';
        }, { once: true });
        img.src = safeUrl;
        thumb.classList.add('has-image');
        thumb.appendChild(img);
        return;
    }

    thumb.textContent = typeof label === 'string' ? label : '';
}

function makeGroundMaterialPickerRow({ label, tooltip = '', onPick }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'options-btn options-btn-primary options-material-picker';

    const thumb = makeEl('div', 'options-material-thumb');
    const textEl = makeEl('div', 'options-material-text');
    btn.appendChild(thumb);
    btn.appendChild(textEl);
    btn.addEventListener('click', () => onPick?.());

    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        btn.title = tooltip;
    }
    return { row, btn, thumb, textEl };
}

function makeSection({ title, collapsedByDefault = false } = {}) {
    let collapsed = !!collapsedByDefault;

    const section = makeEl('div', 'options-section');
    const header = makeEl('div', 'options-section-header');
    header.setAttribute('role', 'button');
    header.tabIndex = 0;

    const titleEl = makeEl('div', 'options-section-title', title);
    const caret = makeEl('button', 'options-btn options-btn-small options-icon-btn', collapsed ? '▸' : '▾');
    caret.type = 'button';

    const applyCollapsed = () => {
        section.classList.toggle('is-collapsed', collapsed);
        caret.textContent = collapsed ? '▸' : '▾';
    };

    const toggle = () => {
        collapsed = !collapsed;
        applyCollapsed();
    };

    caret.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
    });
    header.addEventListener('click', (e) => {
        const btn = e?.target?.closest?.('button');
        if (btn && header.contains(btn)) return;
        toggle();
    });
    header.addEventListener('keydown', (e) => {
        const key = e?.key ?? '';
        if (key !== 'Enter' && key !== ' ') return;
        e.preventDefault();
        toggle();
    });

    header.appendChild(titleEl);
    header.appendChild(caret);
    section.appendChild(header);
    applyCollapsed();
    return section;
}

export class GrassDebuggerUI {
    constructor({ initialState, onChange, onInspectLod1, onCameraBehindBus } = {}) {
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onInspectLod1 = typeof onInspectLod1 === 'function' ? onInspectLod1 : null;
        this._onCameraBehindBus = typeof onCameraBehindBus === 'function' ? onCameraBehindBus : null;
        this._isSetting = false;

        const groundOptions = getPbrMaterialOptionsForGround();
        const defaultGroundMaterialId = groundOptions[0]?.id ?? '';

        const defaultState = {
            tab: 'lod1',
            environment: {
                ibl: {
                    enabled: true,
                    iblId: DEFAULT_IBL_ID,
                    setBackground: true,
                    envMapIntensity: 0.25
                },
                sunIntensity: 1.05
            },
            terrain: {
                showGrid: false,
                groundMaterialId: defaultGroundMaterialId
            },
            lod1: {
                enabled: true,
                region: { innerMeters: 0, outerMeters: 32 },
                angle: { minGrazingDeg: 0, maxGrazingDeg: 90 },
                debug: { printRegion: true, drawBounds: true },
                bladeMeshId: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_V1,
                seed: 'lod1',
                densityPerTile: 350,
                randomYawDeg: 360,
                bladeBend: { min: -35, max: 35 },
                tipBend: { min: -35, max: 35 },
                curvature: { min: 0.4, max: 1.2 }
            },
            lod2: {
                enabled: true,
                region: { innerMeters: 32, outerMeters: 80 },
                angle: { minGrazingDeg: 0, maxGrazingDeg: 90 },
                debug: { printRegion: false, drawBounds: false },
                bladeMeshId: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_V1,
                seed: 'lod2',
                densityPerTile: 110,
                randomYawDeg: 360,
                bladeBend: { min: -35, max: 35 },
                tipBend: { min: -35, max: 35 },
                curvature: { min: 0.4, max: 1.2 }
            },
            lod3: {
                enabled: false,
                region: { innerMeters: 80, outerMeters: 160 },
                angle: { minGrazingDeg: 0, maxGrazingDeg: 90 },
                debug: { printRegion: false, drawBounds: false }
            },
            lod4: {
                enabled: false,
                region: { innerMeters: 160, outerMeters: 260 },
                angle: { minGrazingDeg: 0, maxGrazingDeg: 90 },
                debug: { printRegion: false, drawBounds: false }
            }
        };

        this._state = { ...defaultState, ...(initialState ?? {}) };

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-grass-debugger';

        this._pickerPopup = new PickerPopup();

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const title = makeEl('div', 'options-title', 'Grass Debugger');
        const subtitle = makeEl('div', 'options-subtitle', 'LMB look · RMB orbit · MMB pan · WASD/Arrow keys move · Shift = fast · Wheel dolly · F frame · R reset');
        header.appendChild(title);
        header.appendChild(subtitle);

        this.panel.appendChild(header);

        this.body = makeEl('div', 'options-body');
        this.panel.appendChild(this.body);

        this.root.appendChild(this.panel);

        this._controls = {};
        this._buildTabs();
        this._buildTabBodies();

        this._setActiveTab(this._state.tab);

        this._onKeyDown = (e) => {
            if (!e) return;
            if (e.code !== 'Escape' && e.key !== 'Escape') return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
        };
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    mount() {
        document.body.appendChild(this.root);
    }

    unmount() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._pickerPopup?.dispose?.();
        this._pickerPopup = null;
        this.root.remove();
    }

    getState() {
        return deepClone(this._state);
    }

    setLod1(nextLod1, { emit = true } = {}) {
        const src = nextLod1 && typeof nextLod1 === 'object' ? nextLod1 : null;
        if (!src) return;

        this._isSetting = true;
        const lod = this._state.lod1;
        if (lod && typeof lod === 'object') {
            lod.bladeBend = lod.bladeBend && typeof lod.bladeBend === 'object' ? lod.bladeBend : { min: 0, max: 0 };
            lod.tipBend = lod.tipBend && typeof lod.tipBend === 'object' ? lod.tipBend : { min: 0, max: 0 };
            lod.curvature = lod.curvature && typeof lod.curvature === 'object' ? lod.curvature : { min: 0, max: 0 };

            const nextBladeBend = src.bladeBend && typeof src.bladeBend === 'object' ? src.bladeBend : {};
            const nextTipBend = src.tipBend && typeof src.tipBend === 'object' ? src.tipBend : {};
            const nextCurvature = src.curvature && typeof src.curvature === 'object' ? src.curvature : {};

            if (Number.isFinite(Number(nextBladeBend.min))) lod.bladeBend.min = Number(nextBladeBend.min);
            if (Number.isFinite(Number(nextBladeBend.max))) lod.bladeBend.max = Number(nextBladeBend.max);
            if (Number.isFinite(Number(nextTipBend.min))) lod.tipBend.min = Number(nextTipBend.min);
            if (Number.isFinite(Number(nextTipBend.max))) lod.tipBend.max = Number(nextTipBend.max);
            if (Number.isFinite(Number(nextCurvature.min))) lod.curvature.min = Number(nextCurvature.min);
            if (Number.isFinite(Number(nextCurvature.max))) lod.curvature.max = Number(nextCurvature.max);
        }

        const setSlider = (ctrl, value, digits = 0) => {
            if (!ctrl?.range || !ctrl?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            ctrl.range.value = String(v);
            ctrl.number.value = String(Number.isFinite(digits) ? v.toFixed(digits) : v);
        };

        setSlider(this._controls?.lod1BladeBendMin, lod?.bladeBend?.min, 0);
        setSlider(this._controls?.lod1BladeBendMax, lod?.bladeBend?.max, 0);
        setSlider(this._controls?.lod1TipBendMin, lod?.tipBend?.min, 0);
        setSlider(this._controls?.lod1TipBendMax, lod?.tipBend?.max, 0);
        setSlider(this._controls?.lod1CurvatureMin, lod?.curvature?.min, 2);
        setSlider(this._controls?.lod1CurvatureMax, lod?.curvature?.max, 2);

        this._isSetting = false;
        if (emit) this._emit();
    }

    _emit() {
        if (this._isSetting) return;
        this._onChange?.(this.getState());
    }

    _buildEnvironmentTab(parent) {
        const section = makeSection({ title: 'Environment', collapsedByDefault: false });
        parent.appendChild(section);

        const ibl = this._state.environment.ibl;
        const iblOptions = getIblOptions();

        const enabledRow = makeToggleRow({
            label: 'IBL enabled',
            value: ibl.enabled,
            onChange: (v) => {
                this._state.environment.ibl.enabled = v;
                this._emit();
            }
        });

        const iblRow = makeSelectRow({
            label: 'IBL',
            value: ibl.iblId,
            options: iblOptions,
            onChange: (id) => {
                this._state.environment.ibl.iblId = id;
                this._emit();
            }
        });

        const bgRow = makeToggleRow({
            label: 'IBL background',
            value: ibl.setBackground,
            onChange: (v) => {
                this._state.environment.ibl.setBackground = v;
                this._emit();
            }
        });

        const iblIntensityRow = makeNumberSliderRow({
            label: 'IBL intensity',
            value: ibl.envMapIntensity,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.environment.ibl.envMapIntensity = v;
                this._emit();
            }
        });

        const sunRow = makeNumberSliderRow({
            label: 'Sun intensity',
            value: this._state.environment.sunIntensity,
            min: 0,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.environment.sunIntensity = v;
                this._emit();
            }
        });

        section.appendChild(enabledRow.row);
        section.appendChild(iblRow.row);
        section.appendChild(bgRow.row);
        section.appendChild(iblIntensityRow.row);
        section.appendChild(sunRow.row);

        this._controls.iblEnabled = enabledRow;
        this._controls.iblSelect = iblRow;
        this._controls.iblBackground = bgRow;
        this._controls.iblIntensity = iblIntensityRow;
        this._controls.sunIntensity = sunRow;

        const camSection = makeSection({ title: 'Camera', collapsedByDefault: false });
        parent.appendChild(camSection);

        camSection.appendChild(makeButtonRow({
            label: 'Preset',
            text: 'Behind Bus (Gameplay)',
            onClick: () => this._onCameraBehindBus?.()
        }).row);
    }

    _buildTabs() {
        this.tabs = makeEl('div', 'options-tabs');
        this._tabButtons = {
            environment: makeEl('button', 'options-tab', 'Environment'),
            terrain: makeEl('button', 'options-tab', 'Terrain'),
            lod1: makeEl('button', 'options-tab', 'LOD 1'),
            lod2: makeEl('button', 'options-tab', 'LOD 2'),
            lod3: makeEl('button', 'options-tab', 'LOD 3'),
            lod4: makeEl('button', 'options-tab', 'LOD 4')
        };

        for (const [key, btn] of Object.entries(this._tabButtons)) {
            btn.type = 'button';
            btn.addEventListener('click', () => this._setActiveTab(key));
            this.tabs.appendChild(btn);
        }

        this.body.appendChild(this.tabs);
    }

    _buildTabBodies() {
        this._tabBodies = {
            environment: makeEl('div', null),
            terrain: makeEl('div', null),
            lod1: makeEl('div', null),
            lod2: makeEl('div', null),
            lod3: makeEl('div', null),
            lod4: makeEl('div', null)
        };

        for (const el of Object.values(this._tabBodies)) {
            el.style.display = 'none';
            this.body.appendChild(el);
        }

        this._buildEnvironmentTab(this._tabBodies.environment);
        this._buildTerrainTab(this._tabBodies.terrain);
        this._buildLod1Body(this._tabBodies.lod1);
        this._buildLod2Body(this._tabBodies.lod2);
        this._buildLodStubBody(this._tabBodies.lod3, { key: 'lod3', title: 'LOD 3 (TODO)' });
        this._buildLodStubBody(this._tabBodies.lod4, { key: 'lod4', title: 'LOD 4 (TODO)' });
    }

    _buildRegionRows(lodState, { onAnyChange } = {}) {
        const rows = [];

        rows.push(makeNumberSliderRow({
            label: 'Inner radius (m)',
            value: lodState.region.innerMeters,
            min: 0,
            max: 800,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lodState.region.innerMeters = v;
                if (lodState.region.outerMeters < v) lodState.region.outerMeters = v;
                onAnyChange?.();
            }
        }).row);

        rows.push(makeNumberSliderRow({
            label: 'Outer radius (m)',
            value: lodState.region.outerMeters,
            min: 0,
            max: 800,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lodState.region.outerMeters = v;
                if (lodState.region.innerMeters > v) lodState.region.innerMeters = v;
                onAnyChange?.();
            }
        }).row);

        rows.push(makeNumberSliderRow({
            label: 'Min grazing (deg)',
            value: lodState.angle.minGrazingDeg,
            min: 0,
            max: 90,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lodState.angle.minGrazingDeg = v;
                if (lodState.angle.maxGrazingDeg < v) lodState.angle.maxGrazingDeg = v;
                onAnyChange?.();
            }
        }).row);

        rows.push(makeNumberSliderRow({
            label: 'Max grazing (deg)',
            value: lodState.angle.maxGrazingDeg,
            min: 0,
            max: 90,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lodState.angle.maxGrazingDeg = v;
                if (lodState.angle.minGrazingDeg > v) lodState.angle.minGrazingDeg = v;
                onAnyChange?.();
            }
        }).row);

        return rows;
    }

    _buildDebugRows(lodState, { onAnyChange } = {}) {
        const rows = [];

        rows.push(makeToggleRow({
            label: 'Print region on floor',
            value: lodState.debug.printRegion,
            onChange: (v) => {
                lodState.debug.printRegion = v;
                onAnyChange?.();
            }
        }).row);

        rows.push(makeToggleRow({
            label: 'Draw boundary lines',
            value: lodState.debug.drawBounds,
            onChange: (v) => {
                lodState.debug.drawBounds = v;
                onAnyChange?.();
            }
        }).row);

        return rows;
    }

    _buildLod1Body(parent) {
        const lod = this._state.lod1;

        const section = makeSection({ title: 'LOD 1', collapsedByDefault: false });
        parent.appendChild(section);

        section.appendChild(makeToggleRow({
            label: 'Enabled',
            value: lod.enabled,
            onChange: (v) => {
                lod.enabled = v;
                this._emit();
            }
        }).row);

        for (const row of this._buildRegionRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);
        for (const row of this._buildDebugRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);

        section.appendChild(makeSelectRow({
            label: 'Blade mesh',
            value: lod.bladeMeshId,
            options: [
                { id: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_V1, label: 'Soccer Grass Blade (lo-res)' },
                { id: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_HIRES_V1, label: 'Blade (hi-res)' }
            ],
            onChange: (id) => {
                lod.bladeMeshId = id;
                this._emit();
            }
        }).row);

        section.appendChild(makeSeedRow({
            label: 'Seed',
            value: lod.seed,
            onChange: (v) => {
                lod.seed = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeLogNumberSliderRow({
            label: 'Density (blades / tile)',
            value: lod.densityPerTile,
            min: 0,
            max: 2000000,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.densityPerTile = Math.round(v);
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Random yaw (deg)',
            value: lod.randomYawDeg,
            min: 0,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.randomYawDeg = v;
                this._emit();
            }
        }).row);

        const bladeBendMinRow = makeNumberSliderRow({
            label: 'Blade bend min (deg)',
            value: lod.bladeBend.min,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.bladeBend.min = v;
                if (lod.bladeBend.max < v) lod.bladeBend.max = v;
                this._emit();
            }
        });
        section.appendChild(bladeBendMinRow.row);
        this._controls.lod1BladeBendMin = bladeBendMinRow;

        const bladeBendMaxRow = makeNumberSliderRow({
            label: 'Blade bend max (deg)',
            value: lod.bladeBend.max,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.bladeBend.max = v;
                if (lod.bladeBend.min > v) lod.bladeBend.min = v;
                this._emit();
            }
        });
        section.appendChild(bladeBendMaxRow.row);
        this._controls.lod1BladeBendMax = bladeBendMaxRow;

        const tipBendMinRow = makeNumberSliderRow({
            label: 'Tip bend min (deg)',
            value: lod.tipBend.min,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.tipBend.min = v;
                if (lod.tipBend.max < v) lod.tipBend.max = v;
                this._emit();
            }
        });
        section.appendChild(tipBendMinRow.row);
        this._controls.lod1TipBendMin = tipBendMinRow;

        const tipBendMaxRow = makeNumberSliderRow({
            label: 'Tip bend max (deg)',
            value: lod.tipBend.max,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.tipBend.max = v;
                if (lod.tipBend.min > v) lod.tipBend.min = v;
                this._emit();
            }
        });
        section.appendChild(tipBendMaxRow.row);
        this._controls.lod1TipBendMax = tipBendMaxRow;

        const curvatureMinRow = makeNumberSliderRow({
            label: 'Curvature min',
            value: lod.curvature.min,
            min: 0,
            max: 3,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                lod.curvature.min = v;
                if (lod.curvature.max < v) lod.curvature.max = v;
                this._emit();
            }
        });
        section.appendChild(curvatureMinRow.row);
        this._controls.lod1CurvatureMin = curvatureMinRow;

        const curvatureMaxRow = makeNumberSliderRow({
            label: 'Curvature max',
            value: lod.curvature.max,
            min: 0,
            max: 3,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                lod.curvature.max = v;
                if (lod.curvature.min > v) lod.curvature.min = v;
                this._emit();
            }
        });
        section.appendChild(curvatureMaxRow.row);
        this._controls.lod1CurvatureMax = curvatureMaxRow;

        section.appendChild(makeButtonRow({
            label: 'Inspector',
            text: 'Inspect LOD 1 Grass',
            onClick: () => this._onInspectLod1?.()
        }).row);
    }

    _buildLod2Body(parent) {
        const lod = this._state.lod2;

        const section = makeSection({ title: 'LOD 2', collapsedByDefault: false });
        parent.appendChild(section);

        section.appendChild(makeToggleRow({
            label: 'Enabled',
            value: lod.enabled,
            onChange: (v) => {
                lod.enabled = v;
                this._emit();
            }
        }).row);

        for (const row of this._buildRegionRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);
        for (const row of this._buildDebugRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);

        section.appendChild(makeSelectRow({
            label: 'Blade mesh',
            value: lod.bladeMeshId,
            options: [
                { id: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_V1, label: 'Soccer Grass Blade (lo-res)' }
            ],
            onChange: (id) => {
                lod.bladeMeshId = id;
                this._emit();
            }
        }).row);

        section.appendChild(makeSeedRow({
            label: 'Seed',
            value: lod.seed,
            onChange: (v) => {
                lod.seed = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeLogNumberSliderRow({
            label: 'Density (blades / tile)',
            value: lod.densityPerTile,
            min: 0,
            max: 2000000,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.densityPerTile = Math.round(v);
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Random yaw (deg)',
            value: lod.randomYawDeg,
            min: 0,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.randomYawDeg = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Blade bend min (deg)',
            value: lod.bladeBend.min,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.bladeBend.min = v;
                if (lod.bladeBend.max < v) lod.bladeBend.max = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Blade bend max (deg)',
            value: lod.bladeBend.max,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.bladeBend.max = v;
                if (lod.bladeBend.min > v) lod.bladeBend.min = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Tip bend min (deg)',
            value: lod.tipBend.min,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.tipBend.min = v;
                if (lod.tipBend.max < v) lod.tipBend.max = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Tip bend max (deg)',
            value: lod.tipBend.max,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.tipBend.max = v;
                if (lod.tipBend.min > v) lod.tipBend.min = v;
                this._emit();
            }
        }).row);
    }

    _buildLodStubBody(parent, { key, title }) {
        const lod = this._state[key];
        const section = makeSection({ title, collapsedByDefault: false });
        parent.appendChild(section);

        section.appendChild(makeToggleRow({
            label: 'Enabled',
            value: lod.enabled,
            onChange: (v) => {
                lod.enabled = v;
                this._emit();
            }
        }).row);

        for (const row of this._buildRegionRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);
        for (const row of this._buildDebugRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);

        const msg = makeEl('div', 'options-row-label', 'TODO: LOD rendering not implemented yet.');
        msg.style.opacity = '0.75';
        section.appendChild(msg);
    }

    _buildTerrainTab(parent) {
        const terrain = this._state.terrain && typeof this._state.terrain === 'object'
            ? this._state.terrain
            : (this._state.terrain = { showGrid: false, groundMaterialId: '' });

        const section = makeSection({ title: 'Ground', collapsedByDefault: false });
        parent.appendChild(section);

        section.appendChild(makeToggleRow({
            label: 'Show tile grid',
            value: terrain.showGrid,
            onChange: (v) => {
                terrain.showGrid = v;
                this._emit();
            }
        }).row);

        const options = getPbrMaterialOptionsForGround().map((opt) => ({
            id: String(opt?.id ?? ''),
            label: String(opt?.label ?? opt?.id ?? '')
        })).filter((opt) => opt.id);

        if (!options.length) {
            const msg = makeEl('div', 'options-row-label', 'No ground PBR textures available.');
            msg.style.opacity = '0.75';
            section.appendChild(msg);
            return;
        }

        const desired = String(terrain.groundMaterialId ?? '');
        const current = options.find((o) => o.id === desired)?.id ?? options[0].id;
        terrain.groundMaterialId = current;

        const pickerRow = makeGroundMaterialPickerRow({
            label: 'Ground material',
            onPick: () => this._openGroundMaterialPicker()
        });
        section.appendChild(pickerRow.row);
        this._controls.groundMaterialPicker = pickerRow;
        this._syncGroundMaterialPicker();
    }

    _syncGroundMaterialPicker() {
        const picker = this._controls?.groundMaterialPicker ?? null;
        if (!picker) return;
        const id = String(this._state?.terrain?.groundMaterialId ?? '');
        const options = getPbrMaterialOptionsForGround();
        const found = options.find((opt) => opt?.id === id) ?? options[0] ?? null;
        if (found && this._state?.terrain) this._state.terrain.groundMaterialId = found.id;
        const label = found?.label ?? id ?? '';
        picker.textEl.textContent = label;
        setOptionsThumbToTexture(picker.thumb, found?.previewUrl ?? '', label);
    }

    _openGroundMaterialPicker() {
        const picker = this._controls?.groundMaterialPicker ?? null;
        if (!picker || picker.btn?.disabled) return;

        const sections = getPbrMaterialClassSectionsForGround().map((section) => ({
            label: section.label,
            options: (section.options ?? []).map((opt) => ({
                id: opt.id,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl ?? null
            }))
        }));

        this._pickerPopup?.open?.({
            title: 'Ground material',
            sections,
            selectedId: String(this._state?.terrain?.groundMaterialId ?? ''),
            onSelect: (opt) => {
                this._state.terrain.groundMaterialId = String(opt?.id ?? '');
                this._syncGroundMaterialPicker();
                this._emit();
            }
        });
    }

    _setActiveTab(key) {
        const next = (key === 'environment' || key === 'terrain' || key === 'lod2' || key === 'lod3' || key === 'lod4') ? key : 'lod1';
        this._state.tab = next;
        for (const [id, btn] of Object.entries(this._tabButtons)) btn.classList.toggle('is-active', id === next);
        for (const [id, body] of Object.entries(this._tabBodies)) body.style.display = id === next ? '' : 'none';
        this._emit();
    }
}
