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
import {
    WALL_BASE_TINT_STATE_DEFAULT,
    applyWallBaseTintStateToWallBase,
    resolveWallBaseTintStateFromWallBase
} from '../../../../app/buildings/WallBaseTintModel.js';
import { PickerPopup } from '../../shared/PickerPopup.js';
import { SharedHsvbTintPicker } from '../../shared/tint_picker/SharedHsvbTintPicker.js';

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
            const catalogSectionId = String(entry?.catalogSectionId ?? '').trim().toLowerCase() || 'decorations';
            const catalogSectionLabel = String(entry?.catalogSectionLabel ?? '').trim()
                || (catalogSectionId === 'cornice' ? 'Cornice' : 'Decorations');
            return {
                id,
                label: String(entry?.label ?? id).trim(),
                description: String(entry?.description ?? '').trim(),
                catalogSectionId,
                catalogSectionLabel,
                properties: normalizeConfigurationPropertySpecs(entry?.properties),
                presets: normalizeConfigurationPresets(entry?.presets),
                presetGroups: normalizeConfigurationPresetGroups(entry?.presetGroups, entry?.presets)
            };
        })
        .filter((entry) => !!entry);
}

function normalizeConfigurationPresets(presets) {
    const src = Array.isArray(presets) ? presets : [];
    return src
        .map((item) => {
            const id = String(item?.id ?? '').trim();
            if (!id) return null;
            const label = String(item?.label ?? id).trim();
            const configurationSrc = item?.configuration && typeof item.configuration === 'object'
                ? item.configuration
                : {};
            const configuration = {};
            for (const [key, value] of Object.entries(configurationSrc)) {
                const propId = String(key ?? '').trim();
                if (!propId) continue;
                if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
                    configuration[propId] = value;
                }
            }
            return { id, label, configuration };
        })
        .filter((entry) => !!entry);
}

function normalizeConfigurationPresetGroups(groups, fallbackPresets = null) {
    const src = Array.isArray(groups) ? groups : [];
    const fallback = normalizeConfigurationPresets(fallbackPresets);
    const source = src.length
        ? src
        : (fallback.length
            ? [{ id: 'presets', label: 'Presets', options: fallback }]
            : []);
    return source
        .map((item) => {
            const id = String(item?.id ?? '').trim();
            if (!id) return null;
            const label = String(item?.label ?? id).trim();
            const options = normalizeConfigurationPresets(item?.options);
            if (!options.length) return null;
            return { id, label, options };
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

function normalizeConfigurationPropertyPicker(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'thumbnail') return 'thumbnail';
    return '';
}

function normalizeConfigurationPropertyControl(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'combobox') return 'combobox';
    return '';
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
                            const previewUrl = typeof opt?.previewUrl === 'string' ? opt.previewUrl.trim() : '';
                            return { id: optionId, label: optionLabel, previewUrl };
                        })
                        .filter((opt) => !!opt)
                    : [];
                return {
                    id,
                    label,
                    type,
                    options,
                    picker: normalizeConfigurationPropertyPicker(item?.picker),
                    control: normalizeConfigurationPropertyControl(item?.control)
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

function normalizeViewMode(value) {
    return value === 'wireframe' ? 'wireframe' : 'mesh';
}

function normalizeDecoratorMaterialKind(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'match_wall' || raw === 'match wall' || raw === 'matchwall') return 'match_wall';
    if (raw === 'color') return 'color';
    return 'texture';
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
            if (buttons.has(next)) {
                setActive(next);
                return;
            }
            if (allowNone) clearActive();
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

function makeThumbnailBlocksRow({ label, value = '', options = [], onChange = null }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');
    const wrap = makeEl('div', 'options-pattern-blocks-wrap');
    const blocks = makeEl('div', 'options-pattern-blocks');
    const selectedName = makeEl('div', 'options-pattern-selected-name');

    const buttons = new Map();
    let current = '';

    const setActive = (id, { emit = false } = {}) => {
        const next = String(id ?? '').trim();
        if (!buttons.has(next)) return;
        current = next;
        for (const [key, entry] of buttons.entries()) {
            entry?.btn?.classList?.toggle?.('is-active', key === next);
        }
        const active = buttons.get(next) ?? null;
        selectedName.textContent = String(active?.label ?? '');
        if (emit) onChange?.(next);
    };

    const setOptions = (nextOptions = [], nextValue = null) => {
        const normalized = normalizeOptions(nextOptions);
        const preferred = String(nextValue ?? current ?? value ?? '').trim();
        blocks.textContent = '';
        buttons.clear();

        for (const opt of normalized) {
            const optionId = String(opt?.id ?? '').trim();
            if (!optionId) continue;

            const btn = makeEl('button', 'options-pattern-block-btn');
            btn.type = 'button';
            btn.title = String(opt?.label ?? optionId);
            btn.setAttribute('aria-label', String(opt?.label ?? optionId));

            const img = document.createElement('img');
            img.className = 'options-pattern-block-img';
            img.alt = String(opt?.label ?? optionId);
            img.loading = 'lazy';
            img.src = typeof opt?.previewUrl === 'string' ? opt.previewUrl : '';
            btn.appendChild(img);

            btn.addEventListener('click', () => setActive(optionId, { emit: true }));
            blocks.appendChild(btn);
            buttons.set(optionId, { btn, label: String(opt?.label ?? optionId) });
        }

        if (!buttons.size) {
            current = '';
            selectedName.textContent = '';
            return;
        }
        const firstId = buttons.keys().next().value ?? '';
        setActive(buttons.has(preferred) ? preferred : firstId, { emit: false });
    };

    setOptions(options, value);

    wrap.appendChild(blocks);
    wrap.appendChild(selectedName);
    right.appendChild(wrap);
    row.appendChild(left);
    row.appendChild(right);

    return {
        row,
        setOptions,
        setValue: (id) => {
            const next = String(id ?? '').trim();
            if (!buttons.has(next)) return;
            setActive(next, { emit: false });
        },
        getValue: () => current,
        setDisabled: (disabled) => {
            const off = !!disabled;
            for (const entry of buttons.values()) {
                if (entry?.btn) entry.btn.disabled = off;
            }
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
        placementThirdWallEnabled = false,
        viewMode = 'mesh',
        wallMeshVisible = true,
        thirdWallEnabled = true,
        dummyVisible = true,
        explodedEnabled = false,
        onChange = null,
        onLoadTypeEntry = null,
        onLoadPresetEntry = null,
        onViewModeChange = null,
        onWallMaterialChange = null,
        onPlacementThirdWallEnabledChange = null,
        onWallMeshVisibleChange = null,
        onThirdWallEnabledChange = null,
        onDummyVisibleChange = null,
        onExplodedChange = null
    } = {}) {
        this._draft = sanitizeWallDecoratorDebuggerState(initialState ?? getDefaultWallDecoratorDebuggerState());
        this._typeOptions = normalizeOptions(typeOptions, [{ id: WALL_DECORATOR_ID.SIMPLE_SKIRT, label: 'Simple Skirt' }]);
        this._typeEntries = normalizeTypeEntries(typeEntries);
        this._typeEntryById = new Map(this._typeEntries.map((entry) => [entry.id, entry]));
        this._presetOptions = normalizeOptions(presetOptions, []);
        this._wallMaterialOptions = normalizeWallSurfaceOptions(wallMaterialOptions);
        this._wallMaterialId = String(wallMaterialId ?? '').trim();
        if (!this._wallMaterialOptions.some((opt) => opt.id === this._wallMaterialId)) {
            this._wallMaterialId = this._wallMaterialOptions[0]?.id ?? WALL_SURFACE_NONE_ID;
        }
        this._placementThirdWallEnabled = placementThirdWallEnabled === true;
        this._wallMeshVisible = wallMeshVisible !== false;
        this._thirdWallEnabled = thirdWallEnabled !== false;
        this._dummyVisible = dummyVisible !== false;
        this._explodedEnabled = explodedEnabled === true;
        this._textureOptions = normalizeOptions(textureOptions, [{ id: 'pbr.brick_wall_11', label: 'Brick Wall 11' }]);
        this._colorOptions = normalizeOptions(colorOptions, [{ id: 'belt.white', label: 'White' }]);
        this._viewMode = normalizeViewMode(viewMode);
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onLoadTypeEntry = typeof onLoadTypeEntry === 'function' ? onLoadTypeEntry : null;
        this._onLoadPresetEntry = typeof onLoadPresetEntry === 'function' ? onLoadPresetEntry : null;
        this._onViewModeChange = typeof onViewModeChange === 'function' ? onViewModeChange : null;
        this._onWallMaterialChange = typeof onWallMaterialChange === 'function' ? onWallMaterialChange : null;
        this._onPlacementThirdWallEnabledChange = typeof onPlacementThirdWallEnabledChange === 'function'
            ? onPlacementThirdWallEnabledChange
            : null;
        this._onWallMeshVisibleChange = typeof onWallMeshVisibleChange === 'function' ? onWallMeshVisibleChange : null;
        this._onThirdWallEnabledChange = typeof onThirdWallEnabledChange === 'function' ? onThirdWallEnabledChange : null;
        this._onDummyVisibleChange = typeof onDummyVisibleChange === 'function' ? onDummyVisibleChange : null;
        this._onExplodedChange = typeof onExplodedChange === 'function' ? onExplodedChange : null;
        this._isSetting = false;
        this._activeTabId = 'catalog';
        this._tabs = new Map();
        this._panes = new Map();
        this._controls = {};
        this._configurationControlById = new Map();
        this._pickerPopup = new PickerPopup();
        this._tintControlState = resolveWallBaseTintStateFromWallBase(this._draft.wallBase, WALL_BASE_TINT_STATE_DEFAULT);

        this.leftStack = makeEl('div', 'wall-decoration-left-stack');
        this._buildLeftWallMaterialPanel();
        this._buildLeftViewPanel();

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-wall-decoration-mesh-debugger';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        header.appendChild(makeEl('div', 'options-title', 'Wall Decoration Debugger'));
        this._controls.selectedTypeHeader = makeEl('div', 'options-selected-type');
        header.appendChild(this._controls.selectedTypeHeader);
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
        this._syncWallMeshVisibilityControl();
        this._syncThirdWallControl();
        this._syncDummyVisibilityControl();
        this._syncExplodedControl();
        this._syncAllControlsFromDraft();
    }

    mount(parent = document.body) {
        const host = parent && typeof parent.appendChild === 'function' ? parent : document.body;
        host.appendChild(this.leftStack);
        host.appendChild(this.root);
    }

    destroy() {
        this._controls?.tintPicker?.dispose?.();
        this._pickerPopup?.dispose?.();
        this._pickerPopup = null;
        this.leftStack?.remove?.();
        this.root?.remove?.();
    }

    setState(nextState) {
        this._isSetting = true;
        this._draft = sanitizeWallDecoratorDebuggerState(nextState);
        this._tintControlState = resolveWallBaseTintStateFromWallBase(this._draft.wallBase, WALL_BASE_TINT_STATE_DEFAULT);
        this._syncAllControlsFromDraft();
        this._isSetting = false;
    }

    setWallMaterialId(nextId) {
        const id = String(nextId ?? '').trim();
        this._wallMaterialId = id;
        this._controls.wallMaterialBar?.setValue?.(id);
        if (normalizeDecoratorMaterialKind(this._draft?.materialSelection?.kind) === 'match_wall') {
            this._syncMaterialSelectOptions();
            this._syncMaterialRowsDisabled();
        }
    }

    setExplodedEnabled(nextEnabled) {
        this._setExplodedEnabled(!!nextEnabled, { emit: false });
    }

    setThirdWallEnabled(nextEnabled) {
        this._setThirdWallEnabled(!!nextEnabled, { emit: false });
    }

    setPlacementThirdWallEnabled(nextEnabled) {
        this._setPlacementThirdWallEnabled(!!nextEnabled, { emit: false });
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

    _resolveSelectedTypeLabel() {
        const id = String(this._draft?.decoratorId ?? '').trim();
        if (!id) return '';
        const opt = this._typeOptions.find((item) => String(item?.id ?? '').trim() === id) ?? null;
        if (opt && String(opt.label ?? '').trim()) return String(opt.label).trim();
        const entry = this._typeEntryById.get(id) ?? null;
        if (entry && String(entry.label ?? '').trim()) return String(entry.label).trim();
        return id;
    }

    _syncSelectedTypeHeader() {
        const el = this._controls?.selectedTypeHeader ?? null;
        if (!el) return;
        const typeLabel = this._resolveSelectedTypeLabel();
        if (!typeLabel) {
            el.textContent = '(no type selected)';
            el.classList.add('is-placeholder');
            return;
        }
        el.textContent = typeLabel;
        el.classList.remove('is-placeholder');
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

        const wallVisibility = makeToggleRow({
            label: 'Show wall',
            value: this._wallMeshVisible,
            onChange: (next) => this._setWallMeshVisible(!!next, { emit: true })
        });
        panel.appendChild(wallVisibility.row);

        const thirdWallToggle = makeToggleRow({
            label: 'Third wall',
            value: this._thirdWallEnabled,
            onChange: (next) => this._setThirdWallEnabled(!!next, { emit: true })
        });
        panel.appendChild(thirdWallToggle.row);

        const dummyVisibility = makeToggleRow({
            label: 'Show dummy',
            value: this._dummyVisible,
            onChange: (next) => this._setDummyVisible(!!next, { emit: true })
        });
        panel.appendChild(dummyVisibility.row);

        const explodedToggle = makeToggleRow({
            label: 'Exploded',
            value: this._explodedEnabled,
            onChange: (next) => this._setExplodedEnabled(!!next, { emit: true })
        });
        panel.appendChild(explodedToggle.row);

        this.leftStack.appendChild(panel);

        this._controls.viewMode = { panel, btnMesh, btnWire };
        this._controls.wallMeshVisibility = wallVisibility;
        this._controls.thirdWallToggle = thirdWallToggle;
        this._controls.dummyVisibility = dummyVisibility;
        this._controls.explodedToggle = explodedToggle;
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

    _syncWallMeshVisibilityControl() {
        this._controls.wallMeshVisibility?.setValue?.(!!this._wallMeshVisible);
    }

    _setWallMeshVisible(next, { emit = false } = {}) {
        const visible = !!next;
        if (visible === this._wallMeshVisible) {
            this._syncWallMeshVisibilityControl();
            if (emit) this._onWallMeshVisibleChange?.(visible);
            return;
        }
        this._wallMeshVisible = visible;
        this._syncWallMeshVisibilityControl();
        if (emit) this._onWallMeshVisibleChange?.(visible);
    }

    _syncThirdWallControl() {
        this._controls.thirdWallToggle?.setValue?.(!!this._thirdWallEnabled);
    }

    _setThirdWallEnabled(next, { emit = false } = {}) {
        const enabled = !!next;
        if (enabled === this._thirdWallEnabled) {
            this._syncThirdWallControl();
            if (emit) this._onThirdWallEnabledChange?.(enabled);
            return;
        }
        this._thirdWallEnabled = enabled;
        this._syncThirdWallControl();
        if (emit) this._onThirdWallEnabledChange?.(enabled);
    }

    _syncPlacementThirdWallControl() {
        this._controls.placementThirdWallToggle?.setValue?.(!!this._placementThirdWallEnabled);
    }

    _setPlacementThirdWallEnabled(next, { emit = false } = {}) {
        const enabled = !!next;
        if (enabled === this._placementThirdWallEnabled) {
            this._syncPlacementThirdWallControl();
            if (emit) this._onPlacementThirdWallEnabledChange?.(enabled);
            return;
        }
        this._placementThirdWallEnabled = enabled;
        this._syncPlacementThirdWallControl();
        if (emit) this._onPlacementThirdWallEnabledChange?.(enabled);
    }

    _syncDummyVisibilityControl() {
        this._controls.dummyVisibility?.setValue?.(!!this._dummyVisible);
    }

    _setDummyVisible(next, { emit = false } = {}) {
        const visible = !!next;
        if (visible === this._dummyVisible) {
            this._syncDummyVisibilityControl();
            if (emit) this._onDummyVisibleChange?.(visible);
            return;
        }
        this._dummyVisible = visible;
        this._syncDummyVisibilityControl();
        if (emit) this._onDummyVisibleChange?.(visible);
    }

    _syncExplodedControl() {
        this._controls.explodedToggle?.setValue?.(!!this._explodedEnabled);
    }

    _setExplodedEnabled(next, { emit = false } = {}) {
        const enabled = !!next;
        if (enabled === this._explodedEnabled) {
            this._syncExplodedControl();
            if (emit) this._onExplodedChange?.(enabled);
            return;
        }
        this._explodedEnabled = enabled;
        this._syncExplodedControl();
        if (emit) this._onExplodedChange?.(enabled);
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
                this._syncMaterialSelectOptions();
                this._syncMaterialRowsDisabled();
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

        const sectionGroups = new Map();
        const sectionOrder = [];
        for (const entry of this._typeEntries) {
            const sectionId = String(entry?.catalogSectionId ?? '').trim().toLowerCase() || 'decorations';
            const sectionLabel = String(entry?.catalogSectionLabel ?? '').trim()
                || (sectionId === 'cornice' ? 'Cornice' : 'Decorations');
            if (!sectionGroups.has(sectionId)) {
                sectionGroups.set(sectionId, {
                    id: sectionId,
                    label: sectionLabel,
                    options: []
                });
                sectionOrder.push(sectionId);
            }
            sectionGroups.get(sectionId).options.push({
                id: entry.id,
                label: entry.label
            });
        }
        if (!sectionOrder.length && this._typeOptions.length) {
            sectionOrder.push('decorations');
            sectionGroups.set('decorations', {
                id: 'decorations',
                label: 'Decorations',
                options: this._typeOptions.map((opt) => ({ id: opt.id, label: opt.label }))
            });
        }

        this._controls.decoratorIdSections = [];
        for (const sectionId of sectionOrder) {
            const group = sectionGroups.get(sectionId);
            if (!group || !Array.isArray(group.options) || !group.options.length) continue;
            const section = this._appendSection('catalog', group.label);
            if (!section) continue;
            const control = makeCatalogButtonGridRow({
                hideLabel: true,
                allowNone: true,
                value: this._draft.decoratorId,
                options: group.options,
                onChange: (id) => {
                    const selectedId = String(id ?? this._draft.decoratorId);
                    this._draft.decoratorId = selectedId;
                    const maybeState = this._onLoadTypeEntry?.(selectedId);
                    if (maybeState && typeof maybeState === 'object') this.setState(maybeState);
                    else {
                        this._syncAllControlsFromDraft();
                        this._emit();
                    }
                }
            });
            section.appendChild(control.row);
            this._controls.decoratorIdSections.push(control);
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

        this._controls.placementThirdWallToggle = makeToggleRow({
            label: 'Apply to third wall',
            value: this._placementThirdWallEnabled,
            onChange: (next) => this._setPlacementThirdWallEnabled(!!next, { emit: true })
        });
        sectionPlacement.appendChild(this._controls.placementThirdWallToggle.row);
    }

    _buildConfigurationTab() {
        const sectionPresets = this._appendSection('configuration', 'Presets');
        const sectionProperties = this._appendSection('configuration', 'Properties');
        if (!sectionPresets || !sectionProperties) return;

        this._controls.configurationPresetInfo = makeEl(
            'div',
            'options-note',
            'Select a decoration type to access presets.'
        );
        this._controls.configurationPresetHost = makeEl('div', 'wall-decoration-configuration-preset-host');
        sectionPresets.appendChild(this._controls.configurationPresetInfo);
        sectionPresets.appendChild(this._controls.configurationPresetHost);

        this._controls.configurationInfo = makeEl(
            'div',
            'options-note',
            'Select a decoration type to edit configuration properties.'
        );
        this._controls.configurationHost = makeEl('div', 'wall-decoration-configuration-host');
        sectionProperties.appendChild(this._controls.configurationInfo);
        sectionProperties.appendChild(this._controls.configurationHost);
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
        const presetHost = this._controls?.configurationPresetHost ?? null;
        const presetNote = this._controls?.configurationPresetInfo ?? null;
        if (!host || !note || !presetHost || !presetNote) return;

        host.textContent = '';
        presetHost.textContent = '';
        this._configurationControlById.clear();
        this._controls.configurationPresetGroups = [];

        const typeEntry = this._getActiveTypeEntry();
        const propertySpecs = Array.isArray(typeEntry?.properties) ? typeEntry.properties : [];
        const presetGroups = Array.isArray(typeEntry?.presetGroups) ? typeEntry.presetGroups : [];
        if (!typeEntry || !propertySpecs.length) {
            presetNote.textContent = 'Select a decoration type to access presets.';
            presetNote.style.display = '';
            note.textContent = 'Select a decoration type to edit configuration properties.';
            note.style.display = '';
            return;
        }

        if (presetGroups.length) {
            presetNote.textContent = `Presets from ${typeEntry.label}.`;
            presetNote.style.display = '';
            for (const group of presetGroups) {
                const groupId = String(group?.id ?? '').trim();
                if (!groupId) continue;
                const groupLabel = String(group?.label ?? groupId).trim();
                const options = Array.isArray(group?.options) ? group.options : [];
                if (!options.length) continue;
                const control = makeCatalogButtonGridRow({
                    label: groupLabel,
                    hideLabel: false,
                    allowNone: true,
                    value: '',
                    options: options.map((preset) => ({
                        id: String(preset?.id ?? ''),
                        label: String(preset?.label ?? preset?.id ?? '')
                    })),
                    onChange: (id) => this._applyConfigurationPresetForGroup(groupId, String(id ?? ''))
                });
                presetHost.appendChild(control.row);
                this._controls.configurationPresetGroups.push({
                    groupId,
                    control
                });
            }
        } else {
            presetNote.textContent = 'No presets for this decoration type.';
            presetNote.style.display = '';
        }

        note.textContent = `Properties from ${typeEntry.label}.`;
        note.style.display = '';

        for (const spec of propertySpecs) {
            const propertyId = String(spec?.id ?? '').trim();
            if (!propertyId) continue;
            const propertyType = normalizeConfigurationPropertyType(spec?.type);
            let control = null;
            let controlKind = '';

            if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.BOOL) {
                control = makeToggleRow({
                    label: spec?.label ?? propertyId,
                    value: !!this._draft?.configuration?.[propertyId],
                    onChange: (next) => {
                        this._draft.configuration[propertyId] = !!next;
                        this._emit();
                    }
                });
                controlKind = 'bool';
            } else if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
                const options = Array.isArray(spec?.options) ? spec.options : [];
                const pickerMode = normalizeConfigurationPropertyPicker(spec?.picker);
                const controlMode = normalizeConfigurationPropertyControl(spec?.control);
                const isRibbonPatternControl = typeEntry.id === WALL_DECORATOR_ID.RIBBON
                    && propertyId === 'patternId';
                if (isRibbonPatternControl) {
                    control = makeThumbnailBlocksRow({
                        label: spec?.label ?? propertyId,
                        value: String(this._draft?.configuration?.[propertyId] ?? ''),
                        options,
                        onChange: (next) => {
                            this._draft.configuration[propertyId] = String(next ?? '');
                            this._emit();
                        }
                    });
                    controlKind = 'enum_pattern_blocks';
                } else if (pickerMode === 'thumbnail') {
                    control = makeMaterialPickerRow({
                        label: spec?.label ?? propertyId,
                        onPick: () => this._openConfigurationEnumPicker({ propertyId, spec })
                    });
                    controlKind = 'enum_thumbnail';
                } else if (controlMode === 'combobox') {
                    control = makeSelectRow({
                        label: spec?.label ?? propertyId,
                        value: String(this._draft?.configuration?.[propertyId] ?? ''),
                        options,
                        onChange: (next) => {
                            this._draft.configuration[propertyId] = String(next ?? '');
                            this._emit();
                        }
                    });
                    controlKind = 'enum_select';
                } else {
                    control = makeChoiceRow({
                        label: spec?.label ?? propertyId,
                        value: String(this._draft?.configuration?.[propertyId] ?? ''),
                        options,
                        onChange: (next) => {
                            this._draft.configuration[propertyId] = String(next ?? '');
                            this._emit();
                        }
                    });
                    controlKind = 'enum_choice';
                }
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
                controlKind = isInt ? 'int' : 'float';
            }

            if (!control) continue;
            this._configurationControlById.set(propertyId, { spec, control, controlKind });
            host.appendChild(control.row);
        }
    }

    _applyConfigurationPresetForGroup(groupId, presetId) {
        const typeEntry = this._getActiveTypeEntry();
        const targetGroupId = String(groupId ?? '').trim();
        const targetId = String(presetId ?? '').trim();
        const groups = Array.isArray(typeEntry?.presetGroups) ? typeEntry.presetGroups : [];
        const group = groups.find((item) => String(item?.id ?? '').trim() === targetGroupId) ?? null;
        const options = Array.isArray(group?.options) ? group.options : [];
        const preset = options.find((item) => String(item?.id ?? '') === targetId) ?? null;
        if (!preset) return;

        this._draft.configuration ??= {};
        const nextConfiguration = { ...this._draft.configuration };
        const presetConfiguration = preset?.configuration && typeof preset.configuration === 'object'
            ? preset.configuration
            : {};
        for (const [key, value] of Object.entries(presetConfiguration)) {
            const propertyId = String(key ?? '').trim();
            if (!propertyId) continue;
            nextConfiguration[propertyId] = value;
        }
        this._draft.configuration = nextConfiguration;
        this._syncConfigurationControlsFromDraft();
        this._emit();
    }

    _isPresetValueMatchForSpec(spec, presetValue, currentValue) {
        const type = normalizeConfigurationPropertyType(spec?.type);
        if (type === WALL_DECORATOR_PROPERTY_TYPE.BOOL) {
            return !!presetValue === !!currentValue;
        }
        if (type === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
            return String(presetValue ?? '') === String(currentValue ?? '');
        }
        if (type === WALL_DECORATOR_PROPERTY_TYPE.INT) {
            const presetNum = Number(presetValue);
            const currentNum = Number(currentValue);
            if (!Number.isFinite(presetNum) || !Number.isFinite(currentNum)) return false;
            return Math.round(presetNum) === Math.round(currentNum);
        }
        const presetNum = Number(presetValue);
        const currentNum = Number(currentValue);
        if (!Number.isFinite(presetNum) || !Number.isFinite(currentNum)) return false;
        const step = Number.isFinite(spec?.step) ? Math.abs(Number(spec.step)) : 0.0;
        const eps = Math.max(1e-6, step * 0.5);
        return Math.abs(presetNum - currentNum) <= eps;
    }

    _isConfigurationPresetMatch(typeEntry, preset) {
        const entry = typeEntry && typeof typeEntry === 'object' ? typeEntry : null;
        const presetEntry = preset && typeof preset === 'object' ? preset : null;
        if (!entry || !presetEntry) return false;
        const presetConfiguration = presetEntry.configuration && typeof presetEntry.configuration === 'object'
            ? presetEntry.configuration
            : null;
        if (!presetConfiguration) return false;
        const keys = Object.keys(presetConfiguration);
        if (!keys.length) return false;

        const propertyById = new Map(
            (Array.isArray(entry.properties) ? entry.properties : [])
                .map((spec) => [String(spec?.id ?? '').trim(), spec])
        );

        for (const propertyId of keys) {
            const spec = propertyById.get(String(propertyId ?? '').trim()) ?? null;
            if (!spec) return false;
            const presetValue = presetConfiguration[propertyId];
            const currentValue = this._draft?.configuration?.[propertyId];
            if (!this._isPresetValueMatchForSpec(spec, presetValue, currentValue)) return false;
        }

        return true;
    }

    _resolveMatchingConfigurationPresetId(typeEntry, groupId) {
        const targetGroupId = String(groupId ?? '').trim();
        if (!targetGroupId) return '';
        const groups = Array.isArray(typeEntry?.presetGroups) ? typeEntry.presetGroups : [];
        const group = groups.find((item) => String(item?.id ?? '').trim() === targetGroupId) ?? null;
        const presets = Array.isArray(group?.options) ? group.options : [];
        for (const preset of presets) {
            if (this._isConfigurationPresetMatch(typeEntry, preset)) {
                return String(preset?.id ?? '').trim();
            }
        }
        return '';
    }

    _syncConfigurationPresetSelectionFromDraft() {
        const typeEntry = this._getActiveTypeEntry();
        const groupControls = Array.isArray(this._controls?.configurationPresetGroups)
            ? this._controls.configurationPresetGroups
            : [];
        for (const entry of groupControls) {
            const groupId = String(entry?.groupId ?? '').trim();
            const matchedPresetId = this._resolveMatchingConfigurationPresetId(typeEntry, groupId);
            entry?.control?.setValue?.(matchedPresetId);
        }
    }

    _syncConfigurationThumbnailEnumControl({ propertyId, spec, control }) {
        const options = Array.isArray(spec?.options) ? spec.options : [];
        const selectedId = String(this._draft?.configuration?.[propertyId] ?? '').trim();
        const selected = options.find((opt) => String(opt?.id ?? '') === selectedId) ?? options[0] ?? null;

        if (!selected) {
            control?.setDisabled?.(true);
            if (control?.textEl) control.textEl.textContent = 'No options available';
            if (control?.thumb) setOptionsThumbToTexture(control.thumb, '', 'N/A');
            return;
        }

        this._draft.configuration[propertyId] = String(selected.id ?? '');
        control?.setDisabled?.(false);
        if (control?.textEl) control.textEl.textContent = String(selected.label ?? selected.id ?? '');
        if (control?.thumb) setOptionsThumbToTexture(control.thumb, selected.previewUrl ?? '', String(selected.label ?? selected.id ?? ''));
    }

    _syncConfigurationPatternBlocksEnumControl({ propertyId, spec, control }) {
        const options = Array.isArray(spec?.options) ? spec.options : [];
        const selectedId = String(this._draft?.configuration?.[propertyId] ?? '').trim();
        const selected = options.find((opt) => String(opt?.id ?? '') === selectedId) ?? options[0] ?? null;
        const nextId = String(selected?.id ?? '').trim();

        control?.setOptions?.(options, nextId);
        control?.setDisabled?.(!selected);
        if (!selected) return;

        this._draft.configuration[propertyId] = nextId;
        control?.setValue?.(nextId);
    }

    _openConfigurationEnumPicker({ propertyId, spec }) {
        const property = String(propertyId ?? '').trim();
        if (!property) return;
        const entry = this._configurationControlById.get(property) ?? null;
        const control = entry?.control ?? null;
        if (!control || control.btn?.disabled) return;

        const options = Array.isArray(spec?.options) ? spec.options : [];
        if (!options.length) return;

        this._pickerPopup?.open?.({
            title: String(spec?.label ?? property),
            sections: [{
                label: String(spec?.label ?? 'Options'),
                options: options.map((opt) => ({
                    id: String(opt?.id ?? ''),
                    label: String(opt?.label ?? opt?.id ?? ''),
                    kind: 'texture',
                    previewUrl: typeof opt?.previewUrl === 'string' ? opt.previewUrl : null
                }))
            }],
            selectedId: String(this._draft?.configuration?.[property] ?? ''),
            thumbImageFit: 'contain',
            thumbImageScale: 1.0,
            onSelect: (opt) => {
                this._draft.configuration[property] = String(opt?.id ?? '');
                this._syncConfigurationControlsFromDraft();
                this._emit();
            }
        });
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
            const controlKind = String(entry?.controlKind ?? '');
            if (!spec || !control) continue;
            const spacingMode = String(this._draft?.configuration?.spacingMode ?? '').trim().toLowerCase();
            if (propertyId === 'spacingMeters') {
                const blockSizeMeters = Number(this._draft?.configuration?.blockSizeMeters);
                const isMatchBlock = spacingMode === 'match_block';
                const displaySpacingMeters = isMatchBlock && Number.isFinite(blockSizeMeters)
                    ? Math.max(0.0, blockSizeMeters * 2.0)
                    : Number(this._draft?.configuration?.spacingMeters);
                if (Number.isFinite(displaySpacingMeters)) control.setValue(Number(displaySpacingMeters));
                control.setDisabled?.(isMatchBlock);
                continue;
            }
            const propertyType = normalizeConfigurationPropertyType(spec.type);
            const nextValue = this._draft?.configuration?.[propertyId];
            if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.BOOL) {
                control.setValue(!!nextValue);
                continue;
            }
            if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
                if (controlKind === 'enum_thumbnail') {
                    this._syncConfigurationThumbnailEnumControl({ propertyId, spec, control });
                } else if (controlKind === 'enum_pattern_blocks') {
                    this._syncConfigurationPatternBlocksEnumControl({ propertyId, spec, control });
                } else {
                    control.setValue(String(nextValue ?? ''));
                }
                continue;
            }
            if (Number.isFinite(nextValue)) control.setValue(Number(nextValue));
        }

        this._syncConfigurationPresetSelectionFromDraft();
    }

    _buildMaterialsTab() {
        const sectionMaterial = this._appendSection('materials', 'Decorator Material');
        if (!sectionMaterial) return;

        this._controls.materialKind = makeChoiceRow({
            label: 'Material kind',
            value: normalizeDecoratorMaterialKind(this._draft.materialSelection?.kind),
            options: [
                { id: 'texture', label: 'Texture' },
                { id: 'color', label: 'Color' },
                { id: 'match_wall', label: 'Match wall' }
            ],
            onChange: (id) => {
                const kind = normalizeDecoratorMaterialKind(id);
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

        const tintRow = makeEl('div', 'options-row options-row-wide');
        const tintLabel = makeEl('div', 'options-row-label', 'Tint');
        const tintControl = makeEl('div', 'options-row-control options-row-control-wide');
        this._controls.tintPicker = new SharedHsvbTintPicker({
            initialState: this._tintControlState,
            onChange: (nextState) => {
                this._tintControlState = resolveWallBaseTintStateFromWallBase(nextState, WALL_BASE_TINT_STATE_DEFAULT);
                this._commitTintFromUi();
            }
        });
        tintControl.appendChild(this._controls.tintPicker.element);
        tintRow.appendChild(tintLabel);
        tintRow.appendChild(tintControl);

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

        sectionMaterial.appendChild(tintRow);
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
        this._draft.wallBase ??= {};
        applyWallBaseTintStateToWallBase(this._draft.wallBase, this._tintControlState);
        this._emit();
    }

    _emit() {
        if (this._isSetting) return;
        const sanitized = sanitizeWallDecoratorDebuggerState(this._draft);
        this._draft = sanitized;
        this._syncSelectedTypeHeader();
        this._syncConfigurationPresetSelectionFromDraft();
        this._onChange?.(sanitized);
    }

    _syncMaterialSelectOptions() {
        const kind = normalizeDecoratorMaterialKind(this._draft?.materialSelection?.kind);
        const picker = this._controls?.materialId ?? null;

        if (kind === 'match_wall') {
            this._draft.materialSelection = { kind: 'match_wall', id: 'match_wall' };
            if (picker) {
                const wallSource = this._wallMaterialOptions.find((opt) => opt.id === this._wallMaterialId)
                    ?? this._wallMaterialOptions[0]
                    ?? null;
                picker.setDisabled(true);
                if (!wallSource) {
                    picker.textEl.textContent = 'Match wall';
                    setOptionsThumbToTexture(picker.thumb, '', 'Match wall');
                    return;
                }
                picker.textEl.textContent = `Match wall (${wallSource.label})`;
                if (wallSource.kind === 'none') setOptionsThumbToColor(picker.thumb, wallSource.hex ?? 0x9196a0, wallSource.label);
                else setOptionsThumbToTexture(picker.thumb, wallSource.previewUrl ?? '', wallSource.label);
            }
            return;
        }

        const options = kind === 'color' ? this._colorOptions : this._textureOptions;
        const previousId = this._draft.materialSelection?.id ?? '';
        const selected = options.find((opt) => opt.id === previousId) ?? options[0] ?? null;
        const selectedId = selected?.id ? String(selected.id) : '';
        this._draft.materialSelection = { kind, id: selectedId };

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
        const normalizedKind = normalizeDecoratorMaterialKind(kind);
        if (normalizedKind === 'match_wall') return [];
        const mode = normalizedKind === 'color' ? 'color' : 'texture';
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

        const kind = normalizeDecoratorMaterialKind(this._draft?.materialSelection?.kind);
        if (kind === 'match_wall') return;
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
        const kind = normalizeDecoratorMaterialKind(this._draft?.materialSelection?.kind);
        const isTexture = kind === 'texture';
        const isMatchWall = kind === 'match_wall';
        const tilingEnabled = !!this._draft.tiling?.enabled;
        const uvEnabled = !!this._draft.tiling?.uvEnabled;

        this._controls.materialId?.setDisabled?.(isMatchWall);
        this._controls.tintPicker?.setDisabled?.(!isTexture || isMatchWall);
        this._controls.wallRoughness?.setDisabled?.(isMatchWall);
        this._controls.wallNormalStrength?.setDisabled?.(isMatchWall);
        this._controls.tilingEnabled.setDisabled(!isTexture || isMatchWall);

        this._controls.tileMetersU.setDisabled(!isTexture || !tilingEnabled || isMatchWall);
        this._controls.tileMetersV.setDisabled(!isTexture || !tilingEnabled || isMatchWall);
        this._controls.uvEnabled.setDisabled(!isTexture || isMatchWall);
        this._controls.uvOffsetU.setDisabled(!isTexture || !uvEnabled || isMatchWall);
        this._controls.uvOffsetV.setDisabled(!isTexture || !uvEnabled || isMatchWall);
        this._controls.uvRotation.setDisabled(!isTexture || !uvEnabled || isMatchWall);
    }

    _syncAllControlsFromDraft() {
        const typeControls = Array.isArray(this._controls?.decoratorIdSections) ? this._controls.decoratorIdSections : [];
        for (const control of typeControls) control?.setValue?.(this._draft.decoratorId);
        this._syncSelectedTypeHeader();
        this._controls.whereToApply.setValue(this._draft.whereToApply);
        this._controls.mode.setValue(this._draft.mode);
        this._controls.position.setValue(this._draft.position);
        this._syncPlacementThirdWallControl();
        this._syncConfigurationControlsFromDraft();

        this._controls.materialKind.setValue(normalizeDecoratorMaterialKind(this._draft.materialSelection?.kind));
        this._syncMaterialSelectOptions();

        this._tintControlState = resolveWallBaseTintStateFromWallBase(this._draft.wallBase, WALL_BASE_TINT_STATE_DEFAULT);
        this._controls.tintPicker?.setState?.(this._tintControlState);
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
