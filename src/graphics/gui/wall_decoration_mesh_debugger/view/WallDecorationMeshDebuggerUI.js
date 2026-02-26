// src/graphics/gui/wall_decoration_mesh_debugger/view/WallDecorationMeshDebuggerUI.js
// Docked options UI for the Wall Decoration Mesh Debugger.
// @ts-check

import {
    getDefaultWallDecoratorDebuggerState,
    sanitizeWallDecoratorDebuggerState,
    WALL_DECORATOR_ID,
    WALL_DECORATOR_MODE,
    WALL_DECORATOR_PROPERTY_TYPE,
    WALL_DECORATOR_POSITION,
    WALL_DECORATOR_WHERE_TO_APPLY
} from '../../../../app/buildings/wall_decorators/index.js';
import { PickerPopup } from '../../shared/PickerPopup.js';

const WALL_SURFACE_NONE_ID = 'none';
const WALL_SURFACE_DEFAULT_OPTIONS = Object.freeze([
    Object.freeze({ id: WALL_SURFACE_NONE_ID, label: 'None', kind: 'none', hex: 0x9196a0 }),
    Object.freeze({ id: 'pbr.plastered_wall_02', label: 'Painted plaster wall', kind: 'texture' }),
    Object.freeze({ id: 'pbr.brick_wall_11', label: 'Brick Wall 11', kind: 'texture' })
]);

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

function normalizeOptions(options, fallback = []) {
    const source = Array.isArray(options) ? options : fallback;
    return source
        .map((opt) => ({
            id: String(opt?.id ?? '').trim(),
            label: String(opt?.label ?? opt?.id ?? '').trim(),
            kind: opt?.kind === 'color' ? 'color' : 'texture',
            previewUrl: typeof opt?.previewUrl === 'string' ? opt.previewUrl.trim() : null,
            hex: Number.isFinite(opt?.hex) ? ((Number(opt.hex) >>> 0) & 0xffffff) : null,
            classId: typeof opt?.classId === 'string' ? opt.classId.trim() : '',
            classLabel: typeof opt?.classLabel === 'string' ? opt.classLabel.trim() : ''
        }))
        .filter((opt) => !!opt.id);
}

function normalizeTypeEntries(entries) {
    const src = Array.isArray(entries) ? entries : [];
    return src
        .map((entry) => {
            const id = String(entry?.id ?? '').trim();
            if (!id) return null;
            return {
                id,
                label: String(entry?.label ?? id).trim(),
                description: String(entry?.description ?? '').trim(),
                properties: normalizeConfigurationPropertySpecs(entry?.properties)
            };
        })
        .filter((entry) => !!entry);
}

function normalizeWallSurfaceOptions(options, fallback = WALL_SURFACE_DEFAULT_OPTIONS) {
    const src = Array.isArray(options) && options.length ? options : fallback;
    return src
        .map((item) => {
            const id = String(item?.id ?? '').trim();
            if (!id) return null;
            const kindRaw = String(item?.kind ?? '').trim().toLowerCase();
            const kind = kindRaw === 'none' ? 'none' : 'texture';
            return {
                id,
                label: String(item?.label ?? id).trim(),
                kind,
                previewUrl: typeof item?.previewUrl === 'string' ? item.previewUrl.trim() : '',
                hex: Number.isFinite(item?.hex) ? ((Number(item.hex) >>> 0) & 0xffffff) : null
            };
        })
        .filter((entry) => !!entry);
}

function normalizeConfigurationPropertyType(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WALL_DECORATOR_PROPERTY_TYPE.INT) return WALL_DECORATOR_PROPERTY_TYPE.INT;
    if (raw === WALL_DECORATOR_PROPERTY_TYPE.ENUM) return WALL_DECORATOR_PROPERTY_TYPE.ENUM;
    if (raw === WALL_DECORATOR_PROPERTY_TYPE.BOOL) return WALL_DECORATOR_PROPERTY_TYPE.BOOL;
    return WALL_DECORATOR_PROPERTY_TYPE.FLOAT;
}

function normalizeConfigurationPropertySpecs(specs) {
    const src = Array.isArray(specs) ? specs : [];
    return src
        .map((item) => {
            const id = String(item?.id ?? '').trim();
            if (!id) return null;
            const type = normalizeConfigurationPropertyType(item?.type);
            const label = String(item?.label ?? id).trim();
            if (type === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
                const options = Array.isArray(item?.options)
                    ? item.options
                        .map((opt) => {
                            const optionId = String(opt?.id ?? '').trim();
                            if (!optionId) return null;
                            const optionLabel = String(opt?.label ?? optionId).trim();
                            return { id: optionId, label: optionLabel };
                        })
                        .filter((opt) => !!opt)
                    : [];
                return {
                    id,
                    label,
                    type,
                    options
                };
            }
            if (type === WALL_DECORATOR_PROPERTY_TYPE.BOOL) {
                return { id, label, type };
            }
            const min = Number.isFinite(item?.min) ? Number(item.min) : (type === WALL_DECORATOR_PROPERTY_TYPE.INT ? 0 : 0.0);
            const max = Number.isFinite(item?.max) ? Number(item.max) : (type === WALL_DECORATOR_PROPERTY_TYPE.INT ? 100 : 1.0);
            const step = Number.isFinite(item?.step)
                ? Number(item.step)
                : (type === WALL_DECORATOR_PROPERTY_TYPE.INT ? 1 : 0.01);
            return {
                id,
                label,
                type,
                min,
                max,
                step
            };
        })
        .filter((item) => !!item);
}

function normalizeHueDegrees(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return ((num % 360) + 360) % 360;
}

function rgb01FromHex(hex) {
    const value = Number.isFinite(hex) ? ((Number(hex) >>> 0) & 0xffffff) : 0xffffff;
    return {
        r: ((value >> 16) & 0xff) / 255,
        g: ((value >> 8) & 0xff) / 255,
        b: (value & 0xff) / 255
    };
}

function hexFromRgb01({ r = 1, g = 1, b = 1 } = {}) {
    const rr = clamp(r, 0, 1);
    const gg = clamp(g, 0, 1);
    const bb = clamp(b, 0, 1);
    const ir = Math.round(rr * 255) & 0xff;
    const ig = Math.round(gg * 255) & 0xff;
    const ib = Math.round(bb * 255) & 0xff;
    return ((ir << 16) | (ig << 8) | ib) >>> 0;
}

function hsvFromRgb01({ r = 1, g = 1, b = 1 } = {}) {
    const rr = clamp(r, 0, 1);
    const gg = clamp(g, 0, 1);
    const bb = clamp(b, 0, 1);
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const delta = max - min;
    let hue = 0;
    if (delta > 1e-9) {
        if (max === rr) hue = ((gg - bb) / delta) % 6;
        else if (max === gg) hue = (bb - rr) / delta + 2;
        else hue = (rr - gg) / delta + 4;
        hue *= 60;
    }
    const saturation = max <= 1e-9 ? 0 : (delta / max);
    return {
        hueDeg: normalizeHueDegrees(hue),
        saturation: clamp(saturation, 0, 1),
        value: clamp(max, 0, 1)
    };
}

function rgb01FromHsv({ hueDeg = 0, saturation = 0, value = 1 } = {}) {
    const h = normalizeHueDegrees(hueDeg);
    const s = clamp(saturation, 0, 1);
    const v = clamp(value, 0, 1);
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (h < 60) {
        rr = c;
        gg = x;
    } else if (h < 120) {
        rr = x;
        gg = c;
    } else if (h < 180) {
        gg = c;
        bb = x;
    } else if (h < 240) {
        gg = x;
        bb = c;
    } else if (h < 300) {
        rr = x;
        bb = c;
    } else {
        rr = c;
        bb = x;
    }

    return {
        r: clamp(rr + m, 0, 1),
        g: clamp(gg + m, 0, 1),
        b: clamp(bb + m, 0, 1)
    };
}

function deriveTintControlStateFromHex(tintHex) {
    const rgb = rgb01FromHex(tintHex);
    const nearWhite = rgb.r >= 0.999 && rgb.g >= 0.999 && rgb.b >= 0.999;
    const hsv = hsvFromRgb01(rgb);
    return {
        hueDeg: hsv.hueDeg,
        saturation: hsv.saturation,
        value: hsv.value,
        intensity: nearWhite ? 0 : 1
    };
}

function composeTintHexFromControls({ hueDeg = 0, saturation = 0, value = 1, intensity = 1 } = {}) {
    const pure = rgb01FromHsv({ hueDeg, saturation, value });
    const mix = clamp(intensity, 0, 1);
    const mixed = {
        r: (1 - mix) + (pure.r * mix),
        g: (1 - mix) + (pure.g * mix),
        b: (1 - mix) + (pure.b * mix)
    };
    return hexFromRgb01(mixed);
}

function normalizeViewMode(value) {
    return value === 'wireframe' ? 'wireframe' : 'mesh';
}

function makeChoiceRow({ label, value = '', options = [], onChange = null }) {
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

    for (const opt of normalizeOptions(options)) {
        const btn = makeEl('button', 'options-choice-btn', opt.label);
        btn.type = 'button';
        btn.addEventListener('click', () => {
            setActive(opt.id);
            onChange?.(opt.id);
        });
        group.appendChild(btn);
        buttons.set(opt.id, btn);
    }

    if (!buttons.has(current)) current = buttons.keys().next().value ?? '';
    setActive(current);

    right.appendChild(group);
    row.appendChild(left);
    row.appendChild(right);
    return {
        row,
        setValue: (id) => setActive(id),
        getValue: () => current,
        setDisabled: (disabled) => {
            const off = !!disabled;
            for (const btn of buttons.values()) btn.disabled = off;
        }
    };
}

function makeCatalogButtonGridRow({
    label = '',
    value = '',
    options = [],
    allowNone = false,
    hideLabel = false,
    onChange = null
}) {
    const row = makeEl('div', hideLabel
        ? 'options-row options-row-wide options-action-row'
        : 'options-row options-row-wide');
    const left = hideLabel ? null : makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');
    const group = makeEl('div', 'options-choice-group wall-decoration-catalog-grid');

    const buttons = new Map();
    let current = '';

    const setActive = (id) => {
        const next = String(id ?? '');
        if (!buttons.has(next)) return;
        current = next;
        for (const [key, btn] of buttons.entries()) btn.classList.toggle('is-active', key === next);
    };

    const clearActive = () => {
        current = '';
        for (const btn of buttons.values()) btn.classList.remove('is-active');
    };

    const setOptions = (nextOptions = [], nextValue = null) => {
        const normalized = normalizeOptions(nextOptions);
        const preferred = String(nextValue ?? current ?? value ?? '');

        group.textContent = '';
        buttons.clear();

        for (const opt of normalized) {
            const btn = makeEl('button', 'options-choice-btn wall-decoration-catalog-btn', opt.label);
            btn.type = 'button';
            btn.title = opt.label;
            btn.addEventListener('click', () => {
                setActive(opt.id);
                onChange?.(opt.id);
            });
            group.appendChild(btn);
            buttons.set(opt.id, btn);
        }

        if (!buttons.size) {
            current = '';
            return;
        }
        if (buttons.has(preferred)) {
            setActive(preferred);
            return;
        }
        if (allowNone) {
            clearActive();
            return;
        }
        setActive(buttons.keys().next().value ?? '');
    };

    setOptions(options, value);

    right.appendChild(group);
    if (left) row.appendChild(left);
    row.appendChild(right);
    return {
        row,
        setOptions,
        setValue: (id) => {
            const next = String(id ?? '');
            if (!next && allowNone) {
                clearActive();
                return;
            }
            setActive(next);
        },
        getValue: () => current,
        setDisabled: (disabled) => {
            const off = !!disabled;
            for (const btn of buttons.values()) btn.disabled = off;
        }
    };
}

function makeSelectRow({ label, value = '', options = [], onChange = null }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const select = document.createElement('select');
    select.className = 'options-select options-input-grow';

    const setOptions = (nextOptions, nextValue = null) => {
        const normalized = normalizeOptions(nextOptions);
        const prev = String(nextValue ?? select.value ?? '');
        select.textContent = '';
        for (const opt of normalized) {
            const optionEl = document.createElement('option');
            optionEl.value = opt.id;
            optionEl.textContent = opt.label;
            select.appendChild(optionEl);
        }
        if (!select.options.length) return;
        const exists = normalized.some((opt) => opt.id === prev);
        select.value = exists ? prev : normalized[0].id;
    };

    setOptions(options, value);
    select.addEventListener('change', () => onChange?.(String(select.value)));

    right.appendChild(select);
    row.appendChild(left);
    row.appendChild(right);

    return {
        row,
        select,
        setOptions,
        setValue: (next) => {
            const valueStr = String(next ?? '');
            const exists = Array.from(select.options).some((opt) => opt.value === valueStr);
            if (exists) select.value = valueStr;
        },
        getValue: () => String(select.value ?? ''),
        setDisabled: (disabled) => {
            select.disabled = !!disabled;
        }
    };
}

function setOptionsThumbToTexture(thumb, url, label) {
    if (!thumb) return;
    thumb.textContent = '';
    thumb.classList.remove('has-image');
    thumb.style.removeProperty('background');
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

function setOptionsThumbToColor(thumb, hex, label) {
    if (!thumb) return;
    thumb.textContent = '';
    thumb.classList.remove('has-image');
    thumb.replaceChildren();
    const value = Number.isFinite(hex) ? ((Number(hex) >>> 0) & 0xffffff) : null;
    if (value !== null) {
        thumb.style.background = `#${value.toString(16).padStart(6, '0')}`;
        return;
    }
    thumb.style.removeProperty('background');
    thumb.textContent = typeof label === 'string' ? label : '';
}

function makeMaterialPickerRow({ label, tooltip = '', onPick = null }) {
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
    return {
        row,
        btn,
        thumb,
        textEl,
        setDisabled: (disabled) => {
            btn.disabled = !!disabled;
        }
    };
}

function makeNumberSliderRow({
    label,
    value = 0,
    min = 0,
    max = 1,
    step = 0.01,
    digits = 2,
    onChange = null
}) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'options-range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'options-number';
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);

    const setValue = (next) => {
        const safe = clamp(next, min, max);
        range.value = String(safe);
        number.value = String(safe.toFixed(digits));
    };

    const emit = (raw) => {
        const safe = clamp(raw, min, max);
        setValue(safe);
        onChange?.(safe);
    };

    range.addEventListener('input', () => emit(Number(range.value)));
    number.addEventListener('input', () => emit(Number(number.value)));
    setValue(value);

    right.appendChild(range);
    right.appendChild(number);
    row.appendChild(left);
    row.appendChild(right);

    return {
        row,
        setValue,
        setDisabled: (disabled) => {
            const off = !!disabled;
            range.disabled = off;
            number.disabled = off;
        }
    };
}

function makeToggleRow({ label, value = false, onChange = null }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const wrap = makeEl('label', 'options-toggle-switch');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'options-toggle';
    toggle.checked = !!value;
    toggle.addEventListener('change', () => onChange?.(!!toggle.checked));
    wrap.appendChild(toggle);
    wrap.appendChild(makeEl('span', 'options-toggle-ui'));

    right.appendChild(wrap);
    row.appendChild(left);
    row.appendChild(right);

    return {
        row,
        toggle,
        setValue: (next) => {
            toggle.checked = !!next;
        },
        setDisabled: (disabled) => {
            toggle.disabled = !!disabled;
        }
    };
}

function makeValueRow({ label, value = '' }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');
    const text = makeEl('div', null, value);
    right.appendChild(text);
    row.appendChild(left);
    row.appendChild(right);
    return {
        row,
        text,
        setValue: (next) => {
            text.textContent = String(next ?? '');
        }
    };
}

export class WallDecorationMeshDebuggerUI {
    constructor({
        initialState = null,
        typeOptions = null,
        typeEntries = null,
        presetOptions = null,
        wallMaterialOptions = null,
        wallMaterialId = WALL_SURFACE_NONE_ID,
        textureOptions = null,
        colorOptions = null,
        viewMode = 'mesh',
        onChange = null,
        onLoadTypeEntry = null,
        onLoadPresetEntry = null,
        onViewModeChange = null,
        onWallMaterialChange = null
    } = {}) {
        this._draft = sanitizeWallDecoratorDebuggerState(initialState ?? getDefaultWallDecoratorDebuggerState());
        this._typeOptions = normalizeOptions(typeOptions, [{ id: WALL_DECORATOR_ID.SIMPLE_SKIRT, label: 'Simple Skirt' }]);
        this._typeEntryById = new Map(normalizeTypeEntries(typeEntries).map((entry) => [entry.id, entry]));
        this._presetOptions = normalizeOptions(presetOptions, []);
        this._wallMaterialOptions = normalizeWallSurfaceOptions(wallMaterialOptions);
        this._wallMaterialId = String(wallMaterialId ?? '').trim();
        if (!this._wallMaterialOptions.some((opt) => opt.id === this._wallMaterialId)) {
            this._wallMaterialId = this._wallMaterialOptions[0]?.id ?? WALL_SURFACE_NONE_ID;
        }
        this._selectedPresetId = '';
        this._textureOptions = normalizeOptions(textureOptions, [{ id: 'pbr.brick_wall_11', label: 'Brick Wall 11' }]);
        this._colorOptions = normalizeOptions(colorOptions, [{ id: 'belt.white', label: 'White' }]);
        this._viewMode = normalizeViewMode(viewMode);
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onLoadTypeEntry = typeof onLoadTypeEntry === 'function' ? onLoadTypeEntry : null;
        this._onLoadPresetEntry = typeof onLoadPresetEntry === 'function' ? onLoadPresetEntry : null;
        this._onViewModeChange = typeof onViewModeChange === 'function' ? onViewModeChange : null;
        this._onWallMaterialChange = typeof onWallMaterialChange === 'function' ? onWallMaterialChange : null;
        this._isSetting = false;
        this._activeTabId = 'catalog';
        this._tabs = new Map();
        this._panes = new Map();
        this._controls = {};
        this._configurationControlById = new Map();
        this._pickerPopup = new PickerPopup();
        this._tintControlState = deriveTintControlStateFromHex(this._draft.wallBase?.tintHex ?? 0xffffff);

        this.leftStack = makeEl('div', 'wall-decoration-left-stack');
        this._buildLeftWallMaterialPanel();
        this._buildLeftViewPanel();

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-wall-decoration-mesh-debugger';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        header.appendChild(makeEl('div', 'options-title', 'Wall Decoration Debugger'));
        header.appendChild(makeEl('div', 'options-subtitle', 'RMB orbit · MMB pan · Wheel zoom · F frame · R reset · Esc back'));

        this.tabs = makeEl('div', 'options-tabs');
        this.body = makeEl('div', 'options-body');

        this._buildTab('catalog', 'Catalog');
        this._buildTab('placement', 'Placement');
        this._buildTab('configuration', 'Configuration');
        this._buildTab('materials', 'Materials');

        this._buildCatalogTab();
        this._buildPlacementTab();
        this._buildConfigurationTab();
        this._buildMaterialsTab();

        this.panel.appendChild(header);
        this.panel.appendChild(this.tabs);
        this.panel.appendChild(this.body);
        this.root.appendChild(this.panel);

        this._setActiveTab(this._activeTabId);
        this._syncViewModeControl();
        this._syncAllControlsFromDraft();
    }

    mount(parent = document.body) {
        const host = parent && typeof parent.appendChild === 'function' ? parent : document.body;
        host.appendChild(this.leftStack);
        host.appendChild(this.root);
    }

    destroy() {
        this._pickerPopup?.dispose?.();
        this._pickerPopup = null;
        this.leftStack?.remove?.();
        this.root?.remove?.();
    }

    setState(nextState) {
        this._isSetting = true;
        this._draft = sanitizeWallDecoratorDebuggerState(nextState);
        this._tintControlState = deriveTintControlStateFromHex(this._draft.wallBase?.tintHex ?? 0xffffff);
        this._syncAllControlsFromDraft();
        this._isSetting = false;
    }

    setWallMaterialId(nextId) {
        const id = String(nextId ?? '').trim();
        this._controls.wallMaterialBar?.setValue?.(id);
    }

    _buildTab(id, label) {
        const btn = makeEl('button', 'options-tab', label);
        btn.type = 'button';
        btn.dataset.tabId = id;
        btn.addEventListener('click', () => this._setActiveTab(id));
        this.tabs.appendChild(btn);

        const pane = makeEl('div', 'wall-decoration-tab-pane');
        pane.dataset.tabId = id;
        this.body.appendChild(pane);

        this._tabs.set(id, btn);
        this._panes.set(id, pane);
        return pane;
    }

    _setActiveTab(id) {
        this._activeTabId = String(id ?? 'catalog');
        for (const [tabId, btn] of this._tabs.entries()) btn.classList.toggle('is-active', tabId === this._activeTabId);
        for (const [tabId, pane] of this._panes.entries()) pane.classList.toggle('is-active', tabId === this._activeTabId);
    }

    _appendSection(paneId, title) {
        const pane = this._panes.get(paneId);
        if (!pane) return null;
        const section = makeEl('div', 'options-section');
        section.appendChild(makeEl('div', 'options-section-title', title));
        pane.appendChild(section);
        return section;
    }

    _buildLeftViewPanel() {
        const panel = makeEl('div', 'ui-panel is-interactive wall-decoration-left-panel');
        panel.appendChild(makeEl('div', 'wall-decoration-left-title', 'View'));

        const controls = makeEl('div', 'wall-decoration-left-toggle-group');
        const btnMesh = makeEl('button', 'options-choice-btn wall-decoration-left-toggle-btn', 'Mesh');
        btnMesh.type = 'button';
        btnMesh.addEventListener('click', () => this._setViewMode('mesh', { emit: true }));

        const btnWire = makeEl('button', 'options-choice-btn wall-decoration-left-toggle-btn', 'Wireframe');
        btnWire.type = 'button';
        btnWire.addEventListener('click', () => this._setViewMode('wireframe', { emit: true }));

        controls.appendChild(btnMesh);
        controls.appendChild(btnWire);
        panel.appendChild(controls);
        this.leftStack.appendChild(panel);

        this._controls.viewMode = { panel, btnMesh, btnWire };
    }

    _syncViewModeControl() {
        const ctrl = this._controls?.viewMode ?? null;
        if (!ctrl) return;
        const mode = normalizeViewMode(this._viewMode);
        ctrl.btnMesh.classList.toggle('is-active', mode === 'mesh');
        ctrl.btnWire.classList.toggle('is-active', mode === 'wireframe');
    }

    _setViewMode(next, { emit = false } = {}) {
        const mode = normalizeViewMode(next);
        if (mode === this._viewMode) {
            this._syncViewModeControl();
            if (emit) this._onViewModeChange?.(mode);
            return;
        }
        this._viewMode = mode;
        this._syncViewModeControl();
        if (emit) this._onViewModeChange?.(mode);
    }

    _buildLeftWallMaterialPanel() {
        const panel = makeEl('div', 'ui-panel is-interactive wall-decoration-left-panel wall-decoration-wall-material-panel');
        panel.appendChild(makeEl('div', 'wall-decoration-left-title', 'Wall Material'));

        const group = makeEl('div', 'wall-decoration-wall-material-grid');
        const buttons = new Map();

        const setActive = (id) => {
            const nextId = String(id ?? '').trim();
            if (!buttons.has(nextId)) return;
            this._wallMaterialId = nextId;
            for (const [optionId, btn] of buttons.entries()) {
                btn.classList.toggle('is-active', optionId === nextId);
            }
        };

        for (const option of this._wallMaterialOptions) {
            const btn = makeEl('button', 'options-choice-btn wall-decoration-wall-material-btn');
            btn.type = 'button';
            btn.title = option.label;

            const thumb = makeEl('div', 'options-material-thumb wall-decoration-wall-material-thumb');
            if (option.kind === 'none') {
                setOptionsThumbToColor(thumb, option.hex ?? 0x9196a0, option.label);
            } else {
                setOptionsThumbToTexture(thumb, option.previewUrl ?? '', option.label);
            }

            const text = makeEl('div', 'wall-decoration-wall-material-label', option.label);
            btn.appendChild(thumb);
            btn.appendChild(text);
            btn.addEventListener('click', () => {
                setActive(option.id);
                this._onWallMaterialChange?.(option.id);
            });
            group.appendChild(btn);
            buttons.set(option.id, btn);
        }

        setActive(this._wallMaterialId);
        panel.appendChild(group);
        this.leftStack.appendChild(panel);

        this._controls.wallMaterialBar = {
            panel,
            group,
            buttons,
            setValue: (id) => setActive(id)
        };
    }

    _buildCatalogTab() {
        const paneCatalog = this._panes.get('catalog');
        if (!paneCatalog) return;

        const sectionTypes = this._appendSection('catalog', 'Types');
        if (sectionTypes) {
            this._controls.decoratorId = makeCatalogButtonGridRow({
                hideLabel: true,
                allowNone: true,
                value: this._draft.decoratorId,
                options: this._typeOptions,
                onChange: (id) => {
                    const selectedId = String(id ?? this._draft.decoratorId);
                    this._draft.decoratorId = selectedId;
                    this._selectedPresetId = '';
                    const maybeState = this._onLoadTypeEntry?.(selectedId);
                    if (maybeState && typeof maybeState === 'object') this.setState(maybeState);
                    else {
                        this._syncConfigurationControlsFromDraft();
                        this._emit();
                    }
                }
            });
            sectionTypes.appendChild(this._controls.decoratorId.row);
        }

        const sectionCatalog = this._appendSection('catalog', 'Catalog');
        if (!sectionCatalog) return;

        this._controls.presetId = makeCatalogButtonGridRow({
            hideLabel: true,
            allowNone: true,
            value: this._selectedPresetId,
            options: this._presetOptions,
            onChange: (id) => {
                const selectedId = String(id ?? '');
                this._selectedPresetId = selectedId;
                const maybeState = this._onLoadPresetEntry?.(selectedId);
                if (maybeState && typeof maybeState === 'object') this.setState(maybeState);
                else this._emit();
            }
        });
        sectionCatalog.appendChild(this._controls.presetId.row);

        if (!this._presetOptions.length) {
            this._controls.emptyPresetHint = makeEl('div', 'options-note', 'No saved decoration presets yet.');
            sectionCatalog.appendChild(this._controls.emptyPresetHint);
        }

        this._controls.fixedWallSize = makeValueRow({
            label: 'Wall size',
            value: '10.0m × 3.5m (fixed)'
        });
        paneCatalog.appendChild(this._controls.fixedWallSize.row);
    }

    _buildPlacementTab() {
        const sectionPlacement = this._appendSection('placement', 'Facade Placement');
        if (!sectionPlacement) return;

        this._controls.whereToApply = makeChoiceRow({
            label: 'Where to apply',
            value: this._draft.whereToApply,
            options: [
                { id: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE, label: 'Entire facade' },
                { id: WALL_DECORATOR_WHERE_TO_APPLY.HALF, label: 'Half' }
            ],
            onChange: (id) => {
                this._draft.whereToApply = id;
                this._emit();
            }
        });
        sectionPlacement.appendChild(this._controls.whereToApply.row);

        this._controls.mode = makeChoiceRow({
            label: 'Mode',
            value: this._draft.mode,
            options: [
                { id: WALL_DECORATOR_MODE.FACE, label: 'Face' },
                { id: WALL_DECORATOR_MODE.CORNER, label: 'Corner' }
            ],
            onChange: (id) => {
                this._draft.mode = id;
                this._emit();
            }
        });
        sectionPlacement.appendChild(this._controls.mode.row);

        this._controls.position = makeChoiceRow({
            label: 'Placement',
            value: this._draft.position,
            options: [
                { id: WALL_DECORATOR_POSITION.TOP, label: 'Top' },
                { id: WALL_DECORATOR_POSITION.NEAR_TOP, label: 'Near Top' },
                { id: WALL_DECORATOR_POSITION.NEAR_BOTTOM, label: 'Near Bottom' },
                { id: WALL_DECORATOR_POSITION.BOTTOM, label: 'Bottom' }
            ],
            onChange: (id) => {
                this._draft.position = id;
                this._emit();
            }
        });
        sectionPlacement.appendChild(this._controls.position.row);
    }

    _buildConfigurationTab() {
        const sectionConfiguration = this._appendSection('configuration', 'Type Configuration');
        if (!sectionConfiguration) return;

        this._controls.configurationInfo = makeEl(
            'div',
            'options-note',
            'Select a decoration type to edit configuration properties.'
        );
        this._controls.configurationHost = makeEl('div', 'wall-decoration-configuration-host');
        sectionConfiguration.appendChild(this._controls.configurationInfo);
        sectionConfiguration.appendChild(this._controls.configurationHost);
        this._rebuildConfigurationControls();
    }

    _getActiveTypeEntry() {
        const decoratorId = String(this._draft?.decoratorId ?? '').trim();
        if (!decoratorId) return null;
        return this._typeEntryById.get(decoratorId) ?? null;
    }

    _rebuildConfigurationControls() {
        const host = this._controls?.configurationHost ?? null;
        const note = this._controls?.configurationInfo ?? null;
        if (!host || !note) return;

        host.textContent = '';
        this._configurationControlById.clear();

        const typeEntry = this._getActiveTypeEntry();
        const propertySpecs = Array.isArray(typeEntry?.properties) ? typeEntry.properties : [];
        if (!typeEntry || !propertySpecs.length) {
            note.textContent = 'Select a decoration type to edit configuration properties.';
            note.style.display = '';
            return;
        }

        note.textContent = `Properties from ${typeEntry.label}.`;
        note.style.display = '';

        for (const spec of propertySpecs) {
            const propertyId = String(spec?.id ?? '').trim();
            if (!propertyId) continue;
            const propertyType = normalizeConfigurationPropertyType(spec?.type);
            let control = null;

            if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.BOOL) {
                control = makeToggleRow({
                    label: spec?.label ?? propertyId,
                    value: !!this._draft?.configuration?.[propertyId],
                    onChange: (next) => {
                        this._draft.configuration[propertyId] = !!next;
                        this._emit();
                    }
                });
            } else if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
                const options = Array.isArray(spec?.options) ? spec.options : [];
                control = makeChoiceRow({
                    label: spec?.label ?? propertyId,
                    value: String(this._draft?.configuration?.[propertyId] ?? ''),
                    options,
                    onChange: (next) => {
                        this._draft.configuration[propertyId] = String(next ?? '');
                        this._emit();
                    }
                });
            } else {
                const isInt = propertyType === WALL_DECORATOR_PROPERTY_TYPE.INT;
                const min = Number.isFinite(spec?.min) ? Number(spec.min) : (isInt ? 0 : 0.0);
                const max = Number.isFinite(spec?.max) ? Number(spec.max) : (isInt ? 100 : 1.0);
                const step = Number.isFinite(spec?.step) ? Number(spec.step) : (isInt ? 1 : 0.01);
                const valueRaw = this._draft?.configuration?.[propertyId];
                const fallback = Number.isFinite(valueRaw) ? Number(valueRaw) : min;
                control = makeNumberSliderRow({
                    label: spec?.label ?? propertyId,
                    value: fallback,
                    min,
                    max,
                    step,
                    digits: isInt ? 0 : 2,
                    onChange: (next) => {
                        this._draft.configuration[propertyId] = isInt ? Math.round(next) : next;
                        this._emit();
                    }
                });
            }

            if (!control) continue;
            this._configurationControlById.set(propertyId, { spec, control });
            host.appendChild(control.row);
        }
    }

    _syncConfigurationControlsFromDraft() {
        const typeEntry = this._getActiveTypeEntry();
        const expectedPropertyIds = new Set(
            Array.isArray(typeEntry?.properties)
                ? typeEntry.properties.map((prop) => String(prop?.id ?? '').trim()).filter((id) => !!id)
                : []
        );
        const hasMatchingControls = expectedPropertyIds.size === this._configurationControlById.size
            && Array.from(expectedPropertyIds).every((id) => this._configurationControlById.has(id));
        if (!hasMatchingControls) this._rebuildConfigurationControls();

        for (const [propertyId, entry] of this._configurationControlById.entries()) {
            const spec = entry?.spec ?? null;
            const control = entry?.control ?? null;
            if (!spec || !control) continue;
            const propertyType = normalizeConfigurationPropertyType(spec.type);
            const nextValue = this._draft?.configuration?.[propertyId];
            if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.BOOL) {
                control.setValue(!!nextValue);
                continue;
            }
            if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
                control.setValue(String(nextValue ?? ''));
                continue;
            }
            if (Number.isFinite(nextValue)) control.setValue(Number(nextValue));
        }
    }

    _buildMaterialsTab() {
        const sectionMaterial = this._appendSection('materials', 'Decorator Material');
        if (!sectionMaterial) return;

        this._controls.materialKind = makeChoiceRow({
            label: 'Material kind',
            value: this._draft.materialSelection?.kind ?? 'texture',
            options: [
                { id: 'texture', label: 'Texture' },
                { id: 'color', label: 'Color' }
            ],
            onChange: (id) => {
                const kind = id === 'color' ? 'color' : 'texture';
                this._draft.materialSelection.kind = kind;
                this._syncMaterialSelectOptions();
                this._syncMaterialRowsDisabled();
                this._emit();
            }
        });
        sectionMaterial.appendChild(this._controls.materialKind.row);

        this._controls.materialId = makeMaterialPickerRow({
            label: 'Material',
            onPick: () => this._openMaterialPicker()
        });
        sectionMaterial.appendChild(this._controls.materialId.row);

        this._controls.tintHue = makeNumberSliderRow({
            label: 'Tint hue',
            value: this._tintControlState.hueDeg,
            min: 0,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (next) => {
                this._tintControlState.hueDeg = normalizeHueDegrees(next);
                this._commitTintFromUi();
            }
        });
        this._controls.tintSaturation = makeNumberSliderRow({
            label: 'Tint saturation',
            value: this._tintControlState.saturation,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._tintControlState.saturation = clamp(next, 0, 1);
                this._commitTintFromUi();
            }
        });
        this._controls.tintValue = makeNumberSliderRow({
            label: 'Tint value',
            value: this._tintControlState.value,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._tintControlState.value = clamp(next, 0, 1);
                this._commitTintFromUi();
            }
        });
        this._controls.tintIntensity = makeNumberSliderRow({
            label: 'Tint intensity',
            value: this._tintControlState.intensity,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._tintControlState.intensity = clamp(next, 0, 1);
                this._commitTintFromUi();
            }
        });
        this._controls.wallRoughness = makeNumberSliderRow({
            label: 'Wall roughness',
            value: this._draft.wallBase?.roughness ?? 0.85,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._draft.wallBase.roughness = clamp(next, 0, 1);
                this._emit();
            }
        });
        this._controls.wallNormalStrength = makeNumberSliderRow({
            label: 'Wall normal strength',
            value: this._draft.wallBase?.normalStrength ?? 0.9,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._draft.wallBase.normalStrength = clamp(next, 0, 2);
                this._emit();
            }
        });

        sectionMaterial.appendChild(this._controls.tintHue.row);
        sectionMaterial.appendChild(this._controls.tintSaturation.row);
        sectionMaterial.appendChild(this._controls.tintValue.row);
        sectionMaterial.appendChild(this._controls.tintIntensity.row);
        sectionMaterial.appendChild(this._controls.wallRoughness.row);
        sectionMaterial.appendChild(this._controls.wallNormalStrength.row);

        const sectionTiling = this._appendSection('materials', 'Texture Tiling');
        if (!sectionTiling) return;

        this._controls.tilingEnabled = makeToggleRow({
            label: 'Override tile meters',
            value: !!this._draft.tiling?.enabled,
            onChange: (next) => {
                this._draft.tiling.enabled = !!next;
                this._syncMaterialRowsDisabled();
                this._emit();
            }
        });
        sectionTiling.appendChild(this._controls.tilingEnabled.row);

        this._controls.tileMetersU = makeNumberSliderRow({
            label: 'Tile meters U',
            value: this._draft.tiling?.tileMetersU ?? 2.0,
            min: 0.1,
            max: 20.0,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._draft.tiling.tileMetersU = clamp(next, 0.1, 20.0);
                this._emit();
            }
        });
        this._controls.tileMetersV = makeNumberSliderRow({
            label: 'Tile meters V',
            value: this._draft.tiling?.tileMetersV ?? 2.0,
            min: 0.1,
            max: 20.0,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._draft.tiling.tileMetersV = clamp(next, 0.1, 20.0);
                this._emit();
            }
        });
        sectionTiling.appendChild(this._controls.tileMetersU.row);
        sectionTiling.appendChild(this._controls.tileMetersV.row);

        this._controls.uvEnabled = makeToggleRow({
            label: 'Enable UV transform',
            value: !!this._draft.tiling?.uvEnabled,
            onChange: (next) => {
                this._draft.tiling.uvEnabled = !!next;
                this._syncMaterialRowsDisabled();
                this._emit();
            }
        });
        sectionTiling.appendChild(this._controls.uvEnabled.row);

        this._controls.uvOffsetU = makeNumberSliderRow({
            label: 'U offset (tiles)',
            value: this._draft.tiling?.offsetU ?? 0.0,
            min: -10.0,
            max: 10.0,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._draft.tiling.offsetU = clamp(next, -10.0, 10.0);
                this._emit();
            }
        });
        this._controls.uvOffsetV = makeNumberSliderRow({
            label: 'V offset (tiles)',
            value: this._draft.tiling?.offsetV ?? 0.0,
            min: -10.0,
            max: 10.0,
            step: 0.01,
            digits: 2,
            onChange: (next) => {
                this._draft.tiling.offsetV = clamp(next, -10.0, 10.0);
                this._emit();
            }
        });
        this._controls.uvRotation = makeNumberSliderRow({
            label: 'Rotation (deg)',
            value: this._draft.tiling?.rotationDegrees ?? 0.0,
            min: -180.0,
            max: 180.0,
            step: 1.0,
            digits: 0,
            onChange: (next) => {
                this._draft.tiling.rotationDegrees = clamp(next, -180.0, 180.0);
                this._emit();
            }
        });
        sectionTiling.appendChild(this._controls.uvOffsetU.row);
        sectionTiling.appendChild(this._controls.uvOffsetV.row);
        sectionTiling.appendChild(this._controls.uvRotation.row);
    }

    _commitTintFromUi() {
        this._draft.wallBase.tintHex = composeTintHexFromControls(this._tintControlState);
        this._emit();
    }

    _emit() {
        if (this._isSetting) return;
        const sanitized = sanitizeWallDecoratorDebuggerState(this._draft);
        this._draft = sanitized;
        this._onChange?.(sanitized);
    }

    _syncMaterialSelectOptions() {
        const kind = this._draft.materialSelection?.kind === 'color' ? 'color' : 'texture';
        const options = kind === 'color' ? this._colorOptions : this._textureOptions;
        const previousId = this._draft.materialSelection?.id ?? '';
        const selected = options.find((opt) => opt.id === previousId) ?? options[0] ?? null;
        const selectedId = selected?.id ? String(selected.id) : '';
        this._draft.materialSelection = { kind, id: selectedId };

        const picker = this._controls?.materialId ?? null;
        if (!picker) return;
        picker.setDisabled(!selected);

        if (!selected) {
            picker.textEl.textContent = kind === 'color' ? 'No colors available' : 'No textures available';
            setOptionsThumbToTexture(picker.thumb, '', 'N/A');
            return;
        }

        const label = String(selected.label ?? selected.id ?? '');
        picker.textEl.textContent = label;
        if (kind === 'color') setOptionsThumbToColor(picker.thumb, selected.hex, label);
        else setOptionsThumbToTexture(picker.thumb, selected.previewUrl ?? '', label);
    }

    _buildMaterialPickerSections(kind) {
        const mode = kind === 'color' ? 'color' : 'texture';
        const options = mode === 'color' ? this._colorOptions : this._textureOptions;
        if (!options.length) return [];

        if (mode === 'color') {
            return [{
                label: 'Colors',
                options: options.map((opt) => ({
                    id: opt.id,
                    label: opt.label,
                    kind: 'color',
                    hex: Number.isFinite(opt.hex) ? opt.hex : null
                }))
            }];
        }

        const sectionsByClass = new Map();
        const sectionOrder = [];
        for (const opt of options) {
            const classId = typeof opt.classId === 'string' ? opt.classId.trim() : '';
            const key = classId || '__textures__';
            if (!sectionsByClass.has(key)) {
                const classLabel = typeof opt.classLabel === 'string' ? opt.classLabel.trim() : '';
                sectionsByClass.set(key, {
                    label: classLabel || (classId ? classId : 'Textures'),
                    options: []
                });
                sectionOrder.push(key);
            }
            sectionsByClass.get(key).options.push({
                id: opt.id,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl ?? null
            });
        }

        return sectionOrder
            .map((key) => sectionsByClass.get(key))
            .filter((section) => Array.isArray(section?.options) && section.options.length > 0);
    }

    _openMaterialPicker() {
        const picker = this._controls?.materialId ?? null;
        if (!picker || picker.btn?.disabled) return;

        const kind = this._draft.materialSelection?.kind === 'color' ? 'color' : 'texture';
        const sections = this._buildMaterialPickerSections(kind);
        if (!sections.length) return;

        this._pickerPopup?.open?.({
            title: kind === 'color' ? 'Color Material' : 'Texture Material',
            sections,
            selectedId: String(this._draft.materialSelection?.id ?? ''),
            onSelect: (opt) => {
                this._draft.materialSelection = {
                    kind,
                    id: String(opt?.id ?? '')
                };
                this._syncMaterialSelectOptions();
                this._syncMaterialRowsDisabled();
                this._emit();
            }
        });
    }

    _syncMaterialRowsDisabled() {
        const isTexture = this._draft.materialSelection?.kind !== 'color';
        const tilingEnabled = !!this._draft.tiling?.enabled;
        const uvEnabled = !!this._draft.tiling?.uvEnabled;

        this._controls.tintHue.setDisabled(!isTexture);
        this._controls.tintSaturation.setDisabled(!isTexture);
        this._controls.tintValue.setDisabled(!isTexture);
        this._controls.tintIntensity.setDisabled(!isTexture);
        this._controls.tilingEnabled.setDisabled(!isTexture);

        this._controls.tileMetersU.setDisabled(!isTexture || !tilingEnabled);
        this._controls.tileMetersV.setDisabled(!isTexture || !tilingEnabled);
        this._controls.uvEnabled.setDisabled(!isTexture);
        this._controls.uvOffsetU.setDisabled(!isTexture || !uvEnabled);
        this._controls.uvOffsetV.setDisabled(!isTexture || !uvEnabled);
        this._controls.uvRotation.setDisabled(!isTexture || !uvEnabled);
    }

    _syncAllControlsFromDraft() {
        this._controls.decoratorId.setOptions(this._typeOptions, this._draft.decoratorId);
        if (this._controls.presetId) this._controls.presetId.setOptions(this._presetOptions, this._selectedPresetId);
        this._controls.whereToApply.setValue(this._draft.whereToApply);
        this._controls.mode.setValue(this._draft.mode);
        this._controls.position.setValue(this._draft.position);
        this._syncConfigurationControlsFromDraft();

        this._controls.materialKind.setValue(this._draft.materialSelection?.kind ?? 'texture');
        this._syncMaterialSelectOptions();

        this._tintControlState = deriveTintControlStateFromHex(this._draft.wallBase?.tintHex ?? 0xffffff);
        this._controls.tintHue.setValue(this._tintControlState.hueDeg);
        this._controls.tintSaturation.setValue(this._tintControlState.saturation);
        this._controls.tintValue.setValue(this._tintControlState.value);
        this._controls.tintIntensity.setValue(this._tintControlState.intensity);
        this._controls.wallRoughness.setValue(this._draft.wallBase?.roughness ?? 0.85);
        this._controls.wallNormalStrength.setValue(this._draft.wallBase?.normalStrength ?? 0.9);

        this._controls.tilingEnabled.setValue(!!this._draft.tiling?.enabled);
        this._controls.tileMetersU.setValue(this._draft.tiling?.tileMetersU ?? 2.0);
        this._controls.tileMetersV.setValue(this._draft.tiling?.tileMetersV ?? 2.0);
        this._controls.uvEnabled.setValue(!!this._draft.tiling?.uvEnabled);
        this._controls.uvOffsetU.setValue(this._draft.tiling?.offsetU ?? 0.0);
        this._controls.uvOffsetV.setValue(this._draft.tiling?.offsetV ?? 0.0);
        this._controls.uvRotation.setValue(this._draft.tiling?.rotationDegrees ?? 0.0);

        this._syncMaterialRowsDisabled();
    }
}
