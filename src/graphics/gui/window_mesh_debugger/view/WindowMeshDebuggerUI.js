// src/graphics/gui/window_mesh_debugger/view/WindowMeshDebuggerUI.js
// Docked Options-style panel for the Window Mesh Debugger.
// @ts-check

import { getDefaultWindowMeshSettings, sanitizeWindowMeshSettings, WINDOW_SHADE_COVERAGE, WINDOW_SHADE_DIRECTION } from '../../../../app/buildings/window_mesh/index.js';
import { DEFAULT_IBL_ID, getIblOptions } from '../../../content3d/catalogs/IBLCatalog.js';
import { getPbrMaterialOptionsForBuildings } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { getWindowInteriorAtlasOptions } from '../../../content3d/catalogs/WindowInteriorAtlasCatalog.js';

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
    wrap.appendChild(toggle);
    wrap.appendChild(makeEl('span', 'options-toggle-ui'));

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

function makeTextRow({ label, value = '', placeholder = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'options-number';
    input.value = String(value ?? '');
    input.placeholder = String(placeholder ?? '');
    input.addEventListener('change', () => onChange?.(String(input.value)));
    input.addEventListener('blur', () => onChange?.(String(input.value)));

    right.appendChild(input);
    row.appendChild(left);
    row.appendChild(right);
    return { row, input };
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

function hexFromColorHex(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '#FFFFFF';
    return `#${((num >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`.toUpperCase();
}

function colorHexFromHexString(value) {
    const normalized = normalizeHexColor(value);
    if (!normalized) return 0xffffff;
    return parseInt(normalized.slice(1), 16) & 0xffffff;
}

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj;
}

export class WindowMeshDebuggerUI {
    constructor({
        initialSettings,
        initialSeed = 'window-debug',
        initialWallMaterialId = null,
        onChange
    } = {}) {
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._isSetting = false;

        const defaults = getDefaultWindowMeshSettings();
        const initial = sanitizeWindowMeshSettings({ ...defaults, ...(initialSettings ?? {}) });
        const initialLinkMuntinThickness = Math.abs(Number(initial.muntins.verticalWidth) - Number(initial.muntins.horizontalWidth)) < 1e-6;

        const wallOptions = getPbrMaterialOptionsForBuildings();
        const defaultWall = wallOptions[0]?.id ?? '';

        this._state = {
            seed: String(initialSeed ?? 'window-debug'),
            wallMaterialId: String(initialWallMaterialId ?? defaultWall),
            wallRoughness: 0.85,
            wallNormalIntensity: 1.0,
            wallCutWidthLerp: 1.0,
            wallCutHeightLerp: 1.0,
            ibl: {
                enabled: true,
                envMapIntensity: 0.25,
                iblId: DEFAULT_IBL_ID,
                setBackground: true
            },
            renderMode: 'solid',
            layers: { frame: true, muntins: true, glass: true, shade: true, interior: true },
            decoration: {
                sill: {
                    enabled: false,
                    widthScale: 1.15,
                    height: 0.07,
                    depth: 0.18,
                    gap: 0.0,
                    offset: { x: 0.0, y: 0.0, z: 0.002 },
                    shadows: { cast: true, receive: true },
                    material: {
                        mode: 'pbr',
                        materialId: String(defaultWall),
                        colorHex: 0xf2f2f2,
                        roughness: 0.85,
                        metalness: 0.0,
                        normalStrength: 1.0,
                        uv: { repeatU: 1.0, repeatV: 1.0, offsetU: 0.0, offsetV: 0.0, rotationDeg: 0.0 }
                    }
                },
                header: {
                    enabled: false,
                    widthScale: 1.1,
                    height: 0.06,
                    depth: 0.12,
                    gap: 0.03,
                    offset: { x: 0.0, y: 0.0, z: 0.002 },
                    shadows: { cast: true, receive: true },
                    material: {
                        mode: 'pbr',
                        materialId: String(defaultWall),
                        colorHex: 0xf2f2f2,
                        roughness: 0.85,
                        metalness: 0.0,
                        normalStrength: 1.0,
                        uv: { repeatU: 1.0, repeatV: 1.0, offsetU: 0.0, offsetV: 0.0, rotationDeg: 0.0 }
                    }
                },
                trim: {
                    enabled: false,
                    bandWidth: 0.08,
                    innerGap: 0.005,
                    depth: 0.04,
                    offset: { x: 0.0, y: 0.0, z: 0.002 },
                    shadows: { cast: true, receive: true },
                    material: {
                        mode: 'match_frame',
                        materialId: String(defaultWall),
                        colorHex: 0xf2f2f2,
                        roughness: 0.75,
                        metalness: 0.0,
                        normalStrength: 1.0,
                        uv: { repeatU: 1.0, repeatV: 1.0, offsetU: 0.0, offsetV: 0.0, rotationDeg: 0.0 }
                    }
                }
            },
            debug: { bevelExaggerate: false, linkMuntinThickness: initialLinkMuntinThickness },
            settings: initial
        };

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-window-mesh-debugger';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        header.appendChild(makeEl('div', 'options-title', 'Window Mesh Debugger'));
        header.appendChild(makeEl(
            'div',
            'options-subtitle',
            'Arrow/WASD move · Shift fast · RMB orbit · MMB pan · Wheel zoom · F frame · R reset · Esc back'
        ));
        this.panel.appendChild(header);

        this.body = makeEl('div', 'options-body');
        this.panel.appendChild(this.body);
        this.root.appendChild(this.panel);

        this._controls = {};
        this._interiorOverlayEnabled = false;
        this._interiorOverlayData = null;
        this._interiorOverlayPre = null;

        this._buildSceneSection({ wallOptions });
        this._buildLayersSection();
        this._buildSizeSection();
        this._buildFrameSection();
        this._buildMuntinsSection();
        this._buildGlassSection();
        this._buildShadeSection();
        this._buildDecorationSection({ wallOptions });
        this._buildInteriorSection();

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
        this.root.remove();
    }

    getState() {
        return deepClone(this._state);
    }

    setInteriorOverlayData(data) {
        this._interiorOverlayData = data && typeof data === 'object' ? data : null;
        this._renderInteriorOverlay();
    }

    _emit() {
        if (this._isSetting) return;
        this._onChange?.(this.getState());
    }

    _setSettings(patch) {
        this._state.settings = sanitizeWindowMeshSettings({ ...this._state.settings, ...(patch ?? {}) });
        this._emit();
    }

    _renderInteriorOverlay() {
        const pre = this._interiorOverlayPre;
        if (!pre) return;

        const enabled = !!this._interiorOverlayEnabled;
        pre.classList.toggle('hidden', !enabled);
        if (!enabled) return;

        const src = this._interiorOverlayData && typeof this._interiorOverlayData === 'object' ? this._interiorOverlayData : null;
        if (!src) {
            pre.textContent = 'Interior overlay data unavailable.';
            return;
        }

        const seed = String(src.seed ?? '');
        const atlasId = String(src.atlasId ?? '');
        const cols = Number(src.cols) || 0;
        const rows = Number(src.rows) || 0;
        const items = Array.isArray(src.items) ? src.items : [];

        const lines = [];
        if (seed) lines.push(`Seed: ${seed}`);
        if (atlasId) lines.push(`Atlas: ${atlasId}${cols && rows ? ` (${cols}x${rows})` : ''}`);
        for (const item of items) {
            const id = String(item?.id ?? '');
            const cell = item?.interiorCell && typeof item.interiorCell === 'object' ? item.interiorCell : {};
            const col = Math.max(0, Number(cell.col) || 0);
            const row = Math.max(0, Number(cell.row) || 0);
            const idx = cols > 0 ? row * cols + col : 0;
            const flipX = item?.interiorFlipX ? ' flipX' : '';
            lines.push(`${id}: cell ${col},${row}${cols && rows ? ` (idx ${idx})` : ''}${flipX}`);
        }

        pre.textContent = lines.join('\n');
    }

    _buildSection(title) {
        const section = makeEl('div', 'options-section');
        section.appendChild(makeEl('div', 'options-section-title', title));
        this.body.appendChild(section);
        return section;
    }

    _buildSceneSection({ wallOptions }) {
        const section = this._buildSection('Scene');

        const seedRow = makeTextRow({
            label: 'Seed',
            value: this._state.seed,
            placeholder: 'seed',
            onChange: (v) => {
                this._state.seed = String(v ?? '');
                this._emit();
            }
        });
        section.appendChild(seedRow.row);
        this._controls.seed = seedRow;

        const wallRow = makeSelectRow({
            label: 'Wall (PBR)',
            value: this._state.wallMaterialId,
            options: wallOptions.map((o) => ({ id: o.id, label: o.label })),
            onChange: (id) => {
                this._state.wallMaterialId = String(id ?? '');
                this._emit();
            }
        });
        section.appendChild(wallRow.row);
        this._controls.wall = wallRow;

        const wallRoughnessRow = makeNumberSliderRow({
            label: 'Wall Roughness',
            value: this._state.wallRoughness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.wallRoughness = v;
                this._emit();
            }
        });
        section.appendChild(wallRoughnessRow.row);
        this._controls.wallRoughness = wallRoughnessRow;

        const wallNormalIntensityRow = makeNumberSliderRow({
            label: 'Wall Normal Intensity',
            value: this._state.wallNormalIntensity,
            min: 0.0,
            max: 5.0,
            step: 0.05,
            digits: 2,
            onChange: (v) => {
                this._state.wallNormalIntensity = v;
                this._emit();
            }
        });
        section.appendChild(wallNormalIntensityRow.row);
        this._controls.wallNormalIntensity = wallNormalIntensityRow;

        const renderModeRow = makeChoiceRow({
            label: 'Render Mode',
            value: this._state.renderMode,
            options: [
                { id: 'solid', label: 'Solid' },
                { id: 'wireframe', label: 'Wireframe' },
                { id: 'normals', label: 'Normals' }
            ],
            onChange: (id) => {
                this._state.renderMode = String(id ?? 'solid');
                this._emit();
            }
        });
        section.appendChild(renderModeRow.row);
        this._controls.renderMode = renderModeRow;

        const iblEnabledRow = makeToggleRow({
            label: 'IBL Enabled',
            value: this._state.ibl.enabled,
            onChange: (v) => {
                this._state.ibl.enabled = !!v;
                const disabled = !this._state.ibl.enabled;
                iblIdRow.select.disabled = disabled;
                iblBackgroundRow.toggle.disabled = disabled;
                iblIntensityRow.range.disabled = disabled;
                iblIntensityRow.number.disabled = disabled;
                this._emit();
            }
        });
        section.appendChild(iblEnabledRow.row);
        this._controls.iblEnabled = iblEnabledRow;

        const iblIdRow = makeSelectRow({
            label: 'IBL',
            value: this._state.ibl.iblId,
            options: getIblOptions(),
            onChange: (id) => {
                this._state.ibl.iblId = String(id ?? DEFAULT_IBL_ID);
                this._emit();
            }
        });
        section.appendChild(iblIdRow.row);
        this._controls.iblId = iblIdRow;

        const iblBackgroundRow = makeToggleRow({
            label: 'IBL Background',
            value: this._state.ibl.setBackground,
            onChange: (v) => {
                this._state.ibl.setBackground = !!v;
                this._emit();
            }
        });
        section.appendChild(iblBackgroundRow.row);
        this._controls.iblBackground = iblBackgroundRow;

        const iblIntensityRow = makeNumberSliderRow({
            label: 'IBL Intensity',
            value: this._state.ibl.envMapIntensity,
            min: 0.0,
            max: 5.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.ibl.envMapIntensity = v;
                this._emit();
            }
        });
        section.appendChild(iblIntensityRow.row);
        this._controls.iblIntensity = iblIntensityRow;

        const iblPresetRow = makeEl('div', 'options-row options-row-wide');
        iblPresetRow.appendChild(makeEl('div', 'options-row-label', 'IBL Preset'));
        const iblPresetControl = makeEl('div', 'options-row-control options-row-control-wide');
        const iblPresetButtons = makeEl('div', 'options-choice-group');

        const syncIblUi = () => {
            const disabled = !this._state.ibl.enabled;
            iblIdRow.select.disabled = disabled;
            iblBackgroundRow.toggle.disabled = disabled;
            iblIntensityRow.range.disabled = disabled;
            iblIntensityRow.number.disabled = disabled;
        };

        const applyIblPreset = ({ enabled, envMapIntensity }) => {
            this._state.ibl.enabled = enabled !== undefined ? !!enabled : this._state.ibl.enabled;
            this._state.ibl.envMapIntensity = clamp(envMapIntensity, 0.0, 5.0, this._state.ibl.envMapIntensity);

            iblEnabledRow.toggle.checked = this._state.ibl.enabled;
            const v = this._state.ibl.envMapIntensity;
            iblIntensityRow.range.value = String(v);
            iblIntensityRow.number.value = String(v.toFixed(2));
            syncIblUi();
            this._emit();
        };

        const btnIblSoft = makeEl('button', 'options-choice-btn', 'Soft');
        btnIblSoft.type = 'button';
        btnIblSoft.addEventListener('click', () => applyIblPreset({ enabled: true, envMapIntensity: 0.25 }));
        iblPresetButtons.appendChild(btnIblSoft);

        const btnIblHigh = makeEl('button', 'options-choice-btn', 'High Contrast');
        btnIblHigh.type = 'button';
        btnIblHigh.addEventListener('click', () => applyIblPreset({ enabled: true, envMapIntensity: 1.5 }));
        iblPresetButtons.appendChild(btnIblHigh);

        const btnIblOff = makeEl('button', 'options-choice-btn', 'Off');
        btnIblOff.type = 'button';
        btnIblOff.addEventListener('click', () => applyIblPreset({ enabled: false }));
        iblPresetButtons.appendChild(btnIblOff);

        iblPresetControl.appendChild(iblPresetButtons);
        iblPresetRow.appendChild(iblPresetControl);
        section.appendChild(iblPresetRow);

        const iblDisabled = !this._state.ibl.enabled;
        iblIdRow.select.disabled = iblDisabled;
        iblBackgroundRow.toggle.disabled = iblDisabled;
        iblIntensityRow.range.disabled = iblDisabled;
        iblIntensityRow.number.disabled = iblDisabled;
    }

    _buildLayersSection() {
        const section = this._buildSection('Layers');

        const add = (key, label) => {
            const row = makeToggleRow({
                label,
                value: this._state.layers[key],
                onChange: (v) => {
                    this._state.layers[key] = !!v;
                    this._emit();
                }
            });
            section.appendChild(row.row);
            this._controls[`layer_${key}`] = row;
        };

        add('frame', 'Frame');
        add('muntins', 'Muntins');
        add('glass', 'Glass');
        add('shade', 'Shade');
        add('interior', 'Interior');

        const presetRow = makeEl('div', 'options-row options-row-wide');
        presetRow.appendChild(makeEl('div', 'options-row-label', 'Preset'));
        const presetControl = makeEl('div', 'options-row-control options-row-control-wide');
        const presetButtons = makeEl('div', 'options-choice-group');

        const applyPreset = (next) => {
            this._state.layers = { ...this._state.layers, ...(next ?? {}) };
            for (const [key, value] of Object.entries(next ?? {})) {
                const ctrl = this._controls[`layer_${key}`];
                if (ctrl?.toggle) ctrl.toggle.checked = !!value;
            }
            this._emit();
        };

        const btnAll = makeEl('button', 'options-choice-btn', 'All');
        btnAll.type = 'button';
        btnAll.addEventListener('click', () => applyPreset({ frame: true, muntins: true, glass: true, shade: true, interior: true }));
        presetButtons.appendChild(btnAll);

        const btnGlassOnly = makeEl('button', 'options-choice-btn', 'Glass Only');
        btnGlassOnly.type = 'button';
        btnGlassOnly.addEventListener('click', () => applyPreset({ frame: false, muntins: false, glass: true, shade: false, interior: false }));
        presetButtons.appendChild(btnGlassOnly);

        const btnInteriorOnly = makeEl('button', 'options-choice-btn', 'Interior Only');
        btnInteriorOnly.type = 'button';
        btnInteriorOnly.addEventListener('click', () => applyPreset({ frame: false, muntins: false, glass: false, shade: false, interior: true }));
        presetButtons.appendChild(btnInteriorOnly);

        presetControl.appendChild(presetButtons);
        presetRow.appendChild(presetControl);
        section.appendChild(presetRow);
    }

    _buildSizeSection() {
        const section = this._buildSection('Size');
        const s0 = this._state.settings;

        const syncArchControls = (archEnabledRow, archRatioRow, meetsRectRow, topPieceModeRow, clipVerticalRow) => {
            const s = this._state.settings;
            const arch = s?.arch ?? {};
            const enabled = !!arch.enabled;
            const meetsRect = !!arch.meetsRectangleFrame;

            archEnabledRow.toggle.disabled = false;
            archRatioRow.range.disabled = !enabled;
            archRatioRow.number.disabled = !enabled;
            meetsRectRow.toggle.disabled = !enabled;
            topPieceModeRow.setDisabled(!enabled || !meetsRect);
            clipVerticalRow.toggle.disabled = !enabled || meetsRect;
        };

        const width = makeNumberSliderRow({
            label: 'Width (m)',
            value: s0.width,
            min: 0.3,
            max: 4.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => this._setSettings({ width: v })
        });
        section.appendChild(width.row);

        const height = makeNumberSliderRow({
            label: 'Height (m)',
            value: s0.height,
            min: 0.3,
            max: 6.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => this._setSettings({ height: v })
        });
        section.appendChild(height.row);

        const archEnabled = makeToggleRow({
            label: 'Arch Enabled',
            value: s0.arch.enabled,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ arch: { ...s.arch, enabled: v } });
                syncArchControls(archEnabled, archRatio, meetsRect, topPieceMode, clipVertical);
            }
        });
        section.appendChild(archEnabled.row);

        const archRatio = makeNumberSliderRow({
            label: 'Arch Height Ratio',
            value: s0.arch.heightRatio,
            min: 0.0,
            max: 0.75,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ arch: { ...s.arch, heightRatio: v } });
                syncArchControls(archEnabled, archRatio, meetsRect, topPieceMode, clipVertical);
            }
        });
        section.appendChild(archRatio.row);

        const meetsRect = makeToggleRow({
            label: 'Arch Meets Rect Frame',
            value: s0.arch.meetsRectangleFrame,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ arch: { ...s.arch, meetsRectangleFrame: v } });
                syncArchControls(archEnabled, archRatio, meetsRect, topPieceMode, clipVertical);
            }
        });
        section.appendChild(meetsRect.row);

        const topPieceMode = makeChoiceRow({
            label: 'Arch Top Piece Mode',
            value: s0.arch.topPieceMode,
            options: [
                { id: 'frame', label: 'Frame' },
                { id: 'muntin', label: 'Muntin' }
            ],
            onChange: (id) => {
                const s = this._state.settings;
                this._setSettings({ arch: { ...s.arch, topPieceMode: id } });
            }
        });
        section.appendChild(topPieceMode.row);

        const clipVertical = makeToggleRow({
            label: 'No Verticals In Arch (No Top Piece)',
            value: s0.arch.clipVerticalMuntinsToRectWhenNoTopPiece,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ arch: { ...s.arch, clipVerticalMuntinsToRectWhenNoTopPiece: v } });
            }
        });
        section.appendChild(clipVertical.row);

        const presetRow = makeEl('div', 'options-row options-row-wide');
        presetRow.appendChild(makeEl('div', 'options-row-label', 'Arch Presets'));
        const presetControl = makeEl('div', 'options-row-control options-row-control-wide');
        const presetButtons = makeEl('div', 'options-choice-group');

        const applyArchPreset = ({ meetsRectangleFrame, topPieceMode, clipVerticalMuntinsToRectWhenNoTopPiece }) => {
            const s = this._state.settings;
            this._setSettings({
                arch: {
                    ...s.arch,
                    enabled: true,
                    meetsRectangleFrame: !!meetsRectangleFrame,
                    topPieceMode: String(topPieceMode ?? s.arch.topPieceMode),
                    clipVerticalMuntinsToRectWhenNoTopPiece: !!clipVerticalMuntinsToRectWhenNoTopPiece
                },
                muntins: { ...s.muntins, enabled: true, columns: 2, rows: 2 }
            });
            syncArchControls(archEnabled, archRatio, meetsRect, topPieceMode, clipVertical);
        };

        const btn2x2Frame = makeEl('button', 'options-choice-btn', '2x2 Top=Frame');
        btn2x2Frame.type = 'button';
        btn2x2Frame.addEventListener('click', () => applyArchPreset({
            meetsRectangleFrame: true,
            topPieceMode: 'frame',
            clipVerticalMuntinsToRectWhenNoTopPiece: true
        }));
        presetButtons.appendChild(btn2x2Frame);

        const btn2x2Muntin = makeEl('button', 'options-choice-btn', '2x2 Top=Muntin');
        btn2x2Muntin.type = 'button';
        btn2x2Muntin.addEventListener('click', () => applyArchPreset({
            meetsRectangleFrame: true,
            topPieceMode: 'muntin',
            clipVerticalMuntinsToRectWhenNoTopPiece: true
        }));
        presetButtons.appendChild(btn2x2Muntin);

        const btn2x2NoTop = makeEl('button', 'options-choice-btn', '2x2 No Top');
        btn2x2NoTop.type = 'button';
        btn2x2NoTop.addEventListener('click', () => applyArchPreset({
            meetsRectangleFrame: false,
            topPieceMode: 'muntin',
            clipVerticalMuntinsToRectWhenNoTopPiece: true
        }));
        presetButtons.appendChild(btn2x2NoTop);

        presetControl.appendChild(presetButtons);
        presetRow.appendChild(presetControl);
        section.appendChild(presetRow);

        syncArchControls(archEnabled, archRatio, meetsRect, topPieceMode, clipVertical);
    }

    _buildFrameSection() {
        const section = this._buildSection('Frame');
        const s0 = this._state.settings;

        section.appendChild(makeToggleRow({
            label: 'Bevel Exaggerate',
            value: this._state.debug.bevelExaggerate,
            onChange: (v) => {
                this._state.debug.bevelExaggerate = !!v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Frame Width (m)',
            value: s0.frame.width,
            min: 0.005,
            max: 0.35,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, width: v } });
            }
        }).row);

        const wallCutWidthRow = makeNumberSliderRow({
            label: 'Wall Cut Width (0=Outer · 1=Inner)',
            value: this._state.wallCutWidthLerp,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.wallCutWidthLerp = v;
                this._emit();
            }
        });
        section.appendChild(wallCutWidthRow.row);
        this._controls.wallCutWidth = wallCutWidthRow;

        const wallCutHeightRow = makeNumberSliderRow({
            label: 'Wall Cut Height (0=Outer · 1=Inner)',
            value: this._state.wallCutHeightLerp,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.wallCutHeightLerp = v;
                this._emit();
            }
        });
        section.appendChild(wallCutHeightRow.row);
        this._controls.wallCutHeight = wallCutHeightRow;

        section.appendChild(makeNumberSliderRow({
            label: 'Frame Depth (m)',
            value: s0.frame.depth,
            min: 0.001,
            max: 0.5,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, depth: v } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Inset (m)',
            value: s0.frame.inset,
            min: -1.0,
            max: 1.0,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, inset: v } });
            }
        }).row);

        section.appendChild(makeColorRow({
            label: 'Frame Color',
            value: hexFromColorHex(s0.frame.colorHex),
            onChange: (hex) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, colorHex: colorHexFromHexString(hex) } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Roughness',
            value: s0.frame.material.roughness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, material: { ...s.frame.material, roughness: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Metalness',
            value: s0.frame.material.metalness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, material: { ...s.frame.material, metalness: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'EnvMap Intensity',
            value: s0.frame.material.envMapIntensity,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, material: { ...s.frame.material, envMapIntensity: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Normal Strength',
            value: s0.frame.material.normalStrength,
            min: 0.0,
            max: 5.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, material: { ...s.frame.material, normalStrength: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Bevel Size',
            value: s0.frame.bevel.size,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, bevel: { ...s.frame.bevel, size: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Bevel Roundness',
            value: s0.frame.bevel.roundness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, bevel: { ...s.frame.bevel, roundness: v } } });
            }
        }).row);
    }

    _buildMuntinsSection() {
        const section = this._buildSection('Muntins');
        const s0 = this._state.settings;

        section.appendChild(makeToggleRow({
            label: 'Enabled',
            value: s0.muntins.enabled,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, enabled: v } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Columns',
            value: s0.muntins.columns,
            min: 1,
            max: 12,
            step: 1,
            digits: 0,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, columns: Math.round(v) } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Rows',
            value: s0.muntins.rows,
            min: 1,
            max: 12,
            step: 1,
            digits: 0,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, rows: Math.round(v) } });
            }
        }).row);

        section.appendChild(makeToggleRow({
            label: 'Link Thickness',
            value: this._state.debug.linkMuntinThickness,
            onChange: (v) => {
                this._state.debug.linkMuntinThickness = !!v;
                if (!this._state.debug.linkMuntinThickness) return;
                const s = this._state.settings;
                const next = clamp(s.muntins.verticalWidth, 0.002, 3.0);
                this._setSettings({ muntins: { ...s.muntins, verticalWidth: next, horizontalWidth: next } });
                verticalWidthRow.range.value = String(next);
                verticalWidthRow.number.value = String(next.toFixed(3));
                horizontalWidthRow.range.value = String(next);
                horizontalWidthRow.number.value = String(next.toFixed(3));
            }
        }).row);

        let horizontalWidthRow = null;
        const verticalWidthRow = makeNumberSliderRow({
            label: 'Vertical Width (m)',
            value: s0.muntins.verticalWidth,
            min: 0.002,
            max: 3.0,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                if (this._state.debug.linkMuntinThickness) {
                    this._setSettings({ muntins: { ...s.muntins, verticalWidth: v, horizontalWidth: v } });
                    if (horizontalWidthRow) {
                        const next = clamp(v, 0.002, 3.0);
                        horizontalWidthRow.range.value = String(next);
                        horizontalWidthRow.number.value = String(next.toFixed(3));
                    }
                    return;
                }
                this._setSettings({ muntins: { ...s.muntins, verticalWidth: v } });
            }
        });
        section.appendChild(verticalWidthRow.row);

        horizontalWidthRow = makeNumberSliderRow({
            label: 'Horizontal Height (m)',
            value: s0.muntins.horizontalWidth,
            min: 0.002,
            max: 3.0,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                if (this._state.debug.linkMuntinThickness) {
                    this._setSettings({ muntins: { ...s.muntins, verticalWidth: v, horizontalWidth: v } });
                    const next = clamp(v, 0.002, 3.0);
                    verticalWidthRow.range.value = String(next);
                    verticalWidthRow.number.value = String(next.toFixed(3));
                    return;
                }
                this._setSettings({ muntins: { ...s.muntins, horizontalWidth: v } });
            }
        });
        section.appendChild(horizontalWidthRow.row);

        section.appendChild(makeNumberSliderRow({
            label: 'Depth (m)',
            value: s0.muntins.depth,
            min: 0.0,
            max: 6.25,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, depth: v } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Inset (m)',
            value: s0.muntins.inset,
            min: 0.0,
            max: 0.2,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, inset: v } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'UV Offset X',
            value: s0.muntins.uvOffset.x,
            min: -25.0,
            max: 25.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, uvOffset: { ...s.muntins.uvOffset, x: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'UV Offset Y',
            value: s0.muntins.uvOffset.y,
            min: -25.0,
            max: 25.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, uvOffset: { ...s.muntins.uvOffset, y: v } } });
            }
        }).row);

        section.appendChild(makeToggleRow({
            label: 'Color Inherit',
            value: s0.muntins.colorHex === null,
            onChange: (v) => {
                const s = this._state.settings;
                const next = v ? null : (s.muntins.colorHex ?? s.frame.colorHex);
                this._setSettings({ muntins: { ...s.muntins, colorHex: next } });
            }
        }).row);

        section.appendChild(makeColorRow({
            label: 'Color',
            value: hexFromColorHex(s0.muntins.colorHex ?? s0.frame.colorHex),
            onChange: (hex) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, colorHex: colorHexFromHexString(hex) } });
            }
        }).row);

        const materialInherit = makeToggleRow({
            label: 'Material Inherit',
            value: s0.muntins.material.inheritFromFrame,
            onChange: (v) => {
                const s = this._state.settings;
                const framePbr = s.frame.material;
                const m = s.muntins.material;
                const next = v
                    ? {
                        ...m,
                        inheritFromFrame: true,
                        pbr: {
                            ...m.pbr,
                            roughness: framePbr.roughness,
                            metalness: framePbr.metalness,
                            envMapIntensity: framePbr.envMapIntensity,
                            normalStrength: framePbr.normalStrength
                        }
                    }
                    : { ...m, inheritFromFrame: false };
                this._setSettings({ muntins: { ...s.muntins, material: next } });
                const disabled = !!v;
                roughnessRow.range.disabled = disabled;
                roughnessRow.number.disabled = disabled;
                metalnessRow.range.disabled = disabled;
                metalnessRow.number.disabled = disabled;
                envMapRow.range.disabled = disabled;
                envMapRow.number.disabled = disabled;
                normalStrengthRow.range.disabled = disabled;
                normalStrengthRow.number.disabled = disabled;
            }
        });
        section.appendChild(materialInherit.row);

        const roughnessRow = makeNumberSliderRow({
            label: 'Roughness',
            value: s0.muntins.material.inheritFromFrame ? s0.frame.material.roughness : s0.muntins.material.pbr.roughness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const m = s.muntins.material;
                this._setSettings({ muntins: { ...s.muntins, material: { ...m, pbr: { ...m.pbr, roughness: v } } } });
            }
        });
        section.appendChild(roughnessRow.row);

        const metalnessRow = makeNumberSliderRow({
            label: 'Metalness',
            value: s0.muntins.material.inheritFromFrame ? s0.frame.material.metalness : s0.muntins.material.pbr.metalness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const m = s.muntins.material;
                this._setSettings({ muntins: { ...s.muntins, material: { ...m, pbr: { ...m.pbr, metalness: v } } } });
            }
        });
        section.appendChild(metalnessRow.row);

        const envMapRow = makeNumberSliderRow({
            label: 'EnvMap Intensity',
            value: s0.muntins.material.inheritFromFrame ? s0.frame.material.envMapIntensity : s0.muntins.material.pbr.envMapIntensity,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const m = s.muntins.material;
                this._setSettings({ muntins: { ...s.muntins, material: { ...m, pbr: { ...m.pbr, envMapIntensity: v } } } });
            }
        });
        section.appendChild(envMapRow.row);

        const normalStrengthRow = makeNumberSliderRow({
            label: 'Normal Strength',
            value: s0.muntins.material.inheritFromFrame ? s0.frame.material.normalStrength : s0.muntins.material.pbr.normalStrength,
            min: 0.0,
            max: 5.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const m = s.muntins.material;
                this._setSettings({ muntins: { ...s.muntins, material: { ...m, pbr: { ...m.pbr, normalStrength: v } } } });
            }
        });
        section.appendChild(normalStrengthRow.row);

        const materialDisabled = s0.muntins.material.inheritFromFrame;
        roughnessRow.range.disabled = materialDisabled;
        roughnessRow.number.disabled = materialDisabled;
        metalnessRow.range.disabled = materialDisabled;
        metalnessRow.number.disabled = materialDisabled;
        envMapRow.range.disabled = materialDisabled;
        envMapRow.number.disabled = materialDisabled;
        normalStrengthRow.range.disabled = materialDisabled;
        normalStrengthRow.number.disabled = materialDisabled;

        section.appendChild(makeToggleRow({
            label: 'Bevel Inherit',
            value: s0.muntins.bevel.inherit,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, bevel: { ...s.muntins.bevel, inherit: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Bevel Size',
            value: s0.muntins.bevel.bevel.size,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, bevel: { ...s.muntins.bevel, bevel: { ...s.muntins.bevel.bevel, size: v } } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Bevel Roundness',
            value: s0.muntins.bevel.bevel.roundness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ muntins: { ...s.muntins, bevel: { ...s.muntins.bevel, bevel: { ...s.muntins.bevel.bevel, roundness: v } } } });
            }
        }).row);
    }

    _buildGlassSection() {
        const section = this._buildSection('Glass');
        const s0 = this._state.settings;

        section.appendChild(makeNumberSliderRow({
            label: 'Opacity',
            value: s0.glass.opacity,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ glass: { ...s.glass, opacity: v } });
            }
        }).row);

        section.appendChild(makeColorRow({
            label: 'Tint',
            value: hexFromColorHex(s0.glass.tintHex),
            onChange: (hex) => {
                const s = this._state.settings;
                this._setSettings({ glass: { ...s.glass, tintHex: colorHexFromHexString(hex) } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Z Offset (m)',
            value: s0.glass.zOffset,
            min: -0.25,
            max: 0.25,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ glass: { ...s.glass, zOffset: v } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Metalness',
            value: s0.glass.reflection.metalness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const r = s.glass.reflection;
                this._setSettings({ glass: { ...s.glass, reflection: { ...r, metalness: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Roughness',
            value: s0.glass.reflection.roughness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const r = s.glass.reflection;
                this._setSettings({ glass: { ...s.glass, reflection: { ...r, roughness: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Transmission',
            value: s0.glass.reflection.transmission,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const r = s.glass.reflection;
                this._setSettings({ glass: { ...s.glass, reflection: { ...r, transmission: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'IOR',
            value: s0.glass.reflection.ior,
            min: 1.0,
            max: 2.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const r = s.glass.reflection;
                this._setSettings({ glass: { ...s.glass, reflection: { ...r, ior: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'EnvMap Intensity',
            value: s0.glass.reflection.envMapIntensity,
            min: 0.0,
            max: 8.0,
            step: 0.05,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const r = s.glass.reflection;
                this._setSettings({ glass: { ...s.glass, reflection: { ...r, envMapIntensity: v } } });
            }
        }).row);
    }

    _buildShadeSection() {
        const section = this._buildSection('Shade');
        const s0 = this._state.settings;

        section.appendChild(makeToggleRow({
            label: 'Enabled',
            value: s0.shade.enabled,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ shade: { ...s.shade, enabled: v } });
            }
        }).row);

        section.appendChild(makeChoiceRow({
            label: 'Direction',
            value: String(s0.shade.direction ?? WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM),
            options: [
                { id: WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM, label: 'Top \u2192 Bottom' },
                { id: WINDOW_SHADE_DIRECTION.LEFT_TO_RIGHT, label: 'Left \u2192 Right' },
                { id: WINDOW_SHADE_DIRECTION.RIGHT_TO_LEFT, label: 'Right \u2192 Left' },
                { id: WINDOW_SHADE_DIRECTION.RANDOM_LR, label: 'Random L\u2194R (seeded)' }
            ],
            onChange: (id) => {
                const s = this._state.settings;
                this._setSettings({ shade: { ...s.shade, direction: String(id ?? WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM) } });
            }
        }).row);

        const coverageRow = makeChoiceRow({
            label: 'Coverage',
            value: String(s0.shade.coverage),
            options: [
                { id: String(WINDOW_SHADE_COVERAGE.NONE), label: 'None (0%)' },
                { id: String(WINDOW_SHADE_COVERAGE.PCT_20), label: '20%' },
                { id: String(WINDOW_SHADE_COVERAGE.PCT_50), label: '50%' },
                { id: String(WINDOW_SHADE_COVERAGE.PCT_100), label: '100%' }
            ],
            onChange: (id) => {
                const s = this._state.settings;
                this._setSettings({ shade: { ...s.shade, coverage: Number(id) } });
            }
        });
        coverageRow.setDisabled(!!s0.shade.randomizeCoverage);
        section.appendChild(coverageRow.row);

        section.appendChild(makeToggleRow({
            label: 'Randomize Coverage',
            value: s0.shade.randomizeCoverage,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ shade: { ...s.shade, randomizeCoverage: v } });
                coverageRow.setDisabled(v);
            }
        }).row);

        section.appendChild(makeColorRow({
            label: 'Color',
            value: hexFromColorHex(s0.shade.colorHex),
            onChange: (hex) => {
                const s = this._state.settings;
                this._setSettings({ shade: { ...s.shade, colorHex: colorHexFromHexString(hex) } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Fabric Scale',
            value: s0.shade.fabric.scale,
            min: 0.1,
            max: 40.0,
            step: 0.1,
            digits: 1,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ shade: { ...s.shade, fabric: { ...s.shade.fabric, scale: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Fabric Intensity',
            value: s0.shade.fabric.intensity,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ shade: { ...s.shade, fabric: { ...s.shade.fabric, intensity: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Z Offset (m)',
            value: s0.shade.zOffset,
            min: -1.0,
            max: 0.25,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ shade: { ...s.shade, zOffset: v } });
            }
        }).row);
    }

    _buildDecorationSection({ wallOptions }) {
        const section = this._buildSection('Decoration');
        const pbrOptions = (Array.isArray(wallOptions) ? wallOptions : getPbrMaterialOptionsForBuildings())
            .map((o) => ({ id: o.id, label: o.label }));

        const buildMaterialControls = (labelPrefix, decoKey) => {
            const d0 = this._state.decoration?.[decoKey] ?? {};
            const mat0 = d0.material ?? {};
            const uv0 = mat0.uv ?? {};

            section.appendChild(makeChoiceRow({
                label: `${labelPrefix} Material`,
                value: String(mat0.mode ?? 'pbr'),
                options: [
                    { id: 'pbr', label: 'PBR' },
                    { id: 'solid', label: 'Solid Color' },
                    { id: 'match_frame', label: 'Match Frame' }
                ],
                onChange: (id) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    block.material = { ...(block.material ?? {}), mode: String(id ?? 'pbr') };
                    this._emit();
                }
            }).row);

            section.appendChild(makeSelectRow({
                label: `${labelPrefix} PBR`,
                value: String(mat0.materialId ?? ''),
                options: pbrOptions,
                onChange: (id) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    block.material = { ...(block.material ?? {}), materialId: String(id ?? '') };
                    this._emit();
                }
            }).row);

            section.appendChild(makeColorRow({
                label: `${labelPrefix} Color`,
                value: hexFromColorHex(mat0.colorHex),
                onChange: (hex) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    block.material = { ...(block.material ?? {}), colorHex: colorHexFromHexString(hex) };
                    this._emit();
                }
            }).row);

            section.appendChild(makeNumberSliderRow({
                label: `${labelPrefix} Roughness`,
                value: mat0.roughness ?? 0.85,
                min: 0.0,
                max: 1.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    block.material = { ...(block.material ?? {}), roughness: v };
                    this._emit();
                }
            }).row);

            section.appendChild(makeNumberSliderRow({
                label: `${labelPrefix} Metalness`,
                value: mat0.metalness ?? 0.0,
                min: 0.0,
                max: 1.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    block.material = { ...(block.material ?? {}), metalness: v };
                    this._emit();
                }
            }).row);

            section.appendChild(makeNumberSliderRow({
                label: `${labelPrefix} Normal Strength`,
                value: mat0.normalStrength ?? 1.0,
                min: 0.0,
                max: 5.0,
                step: 0.05,
                digits: 2,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    block.material = { ...(block.material ?? {}), normalStrength: v };
                    this._emit();
                }
            }).row);

            section.appendChild(makeNumberSliderRow({
                label: `${labelPrefix} UV Repeat U`,
                value: uv0.repeatU ?? 1.0,
                min: 0.05,
                max: 20.0,
                step: 0.05,
                digits: 2,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    const m = block.material ?? {};
                    const uv = m.uv ?? {};
                    block.material = { ...m, uv: { ...uv, repeatU: v } };
                    this._emit();
                }
            }).row);

            section.appendChild(makeNumberSliderRow({
                label: `${labelPrefix} UV Repeat V`,
                value: uv0.repeatV ?? 1.0,
                min: 0.05,
                max: 20.0,
                step: 0.05,
                digits: 2,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    const m = block.material ?? {};
                    const uv = m.uv ?? {};
                    block.material = { ...m, uv: { ...uv, repeatV: v } };
                    this._emit();
                }
            }).row);

            section.appendChild(makeNumberSliderRow({
                label: `${labelPrefix} UV Offset U`,
                value: uv0.offsetU ?? 0.0,
                min: -5.0,
                max: 5.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    const m = block.material ?? {};
                    const uv = m.uv ?? {};
                    block.material = { ...m, uv: { ...uv, offsetU: v } };
                    this._emit();
                }
            }).row);

            section.appendChild(makeNumberSliderRow({
                label: `${labelPrefix} UV Offset V`,
                value: uv0.offsetV ?? 0.0,
                min: -5.0,
                max: 5.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    const m = block.material ?? {};
                    const uv = m.uv ?? {};
                    block.material = { ...m, uv: { ...uv, offsetV: v } };
                    this._emit();
                }
            }).row);

            section.appendChild(makeNumberSliderRow({
                label: `${labelPrefix} UV Rotation`,
                value: uv0.rotationDeg ?? 0.0,
                min: -180.0,
                max: 180.0,
                step: 1.0,
                digits: 0,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    const m = block.material ?? {};
                    const uv = m.uv ?? {};
                    block.material = { ...m, uv: { ...uv, rotationDeg: v } };
                    this._emit();
                }
            }).row);
        };

        const buildShadowControls = (labelPrefix, decoKey) => {
            const d0 = this._state.decoration?.[decoKey] ?? {};
            const s0 = d0.shadows ?? {};

            section.appendChild(makeToggleRow({
                label: `${labelPrefix} Cast Shadow`,
                value: s0.cast !== false,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    block.shadows = { ...(block.shadows ?? {}), cast: !!v };
                    this._emit();
                }
            }).row);

            section.appendChild(makeToggleRow({
                label: `${labelPrefix} Receive Shadow`,
                value: s0.receive !== false,
                onChange: (v) => {
                    const block = this._state.decoration?.[decoKey];
                    if (!block) return;
                    block.shadows = { ...(block.shadows ?? {}), receive: !!v };
                    this._emit();
                }
            }).row);
        };

        const addTitle = (title) => {
            section.appendChild(makeEl('div', 'options-section-title', title));
        };

        addTitle('Sill');
        section.appendChild(makeToggleRow({
            label: 'Sill Enabled',
            value: !!this._state.decoration?.sill?.enabled,
            onChange: (v) => {
                const block = this._state.decoration?.sill;
                if (!block) return;
                block.enabled = !!v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sill Width Scale',
            value: this._state.decoration?.sill?.widthScale ?? 1.15,
            min: 0.5,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const block = this._state.decoration?.sill;
                if (!block) return;
                block.widthScale = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sill Height (m)',
            value: this._state.decoration?.sill?.height ?? 0.07,
            min: 0.005,
            max: 0.6,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.sill;
                if (!block) return;
                block.height = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sill Depth (m)',
            value: this._state.decoration?.sill?.depth ?? 0.18,
            min: 0.01,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const block = this._state.decoration?.sill;
                if (!block) return;
                block.depth = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sill Gap From Window (m)',
            value: this._state.decoration?.sill?.gap ?? 0.0,
            min: -0.25,
            max: 0.5,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.sill;
                if (!block) return;
                block.gap = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sill Offset X (m)',
            value: this._state.decoration?.sill?.offset?.x ?? 0.0,
            min: -2.0,
            max: 2.0,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.sill;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), x: v };
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sill Offset Y (m)',
            value: this._state.decoration?.sill?.offset?.y ?? 0.0,
            min: -2.0,
            max: 2.0,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.sill;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), y: v };
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sill Offset Z (m)',
            value: this._state.decoration?.sill?.offset?.z ?? 0.002,
            min: -0.25,
            max: 0.25,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.sill;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), z: v };
                this._emit();
            }
        }).row);

        buildShadowControls('Sill', 'sill');
        buildMaterialControls('Sill', 'sill');

        addTitle('Header / Lintel');
        section.appendChild(makeToggleRow({
            label: 'Header Enabled',
            value: !!this._state.decoration?.header?.enabled,
            onChange: (v) => {
                const block = this._state.decoration?.header;
                if (!block) return;
                block.enabled = !!v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Header Width Scale',
            value: this._state.decoration?.header?.widthScale ?? 1.1,
            min: 0.5,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const block = this._state.decoration?.header;
                if (!block) return;
                block.widthScale = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Header Height (m)',
            value: this._state.decoration?.header?.height ?? 0.06,
            min: 0.005,
            max: 0.6,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.header;
                if (!block) return;
                block.height = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Header Depth (m)',
            value: this._state.decoration?.header?.depth ?? 0.12,
            min: 0.01,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const block = this._state.decoration?.header;
                if (!block) return;
                block.depth = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Header Gap From Window (m)',
            value: this._state.decoration?.header?.gap ?? 0.03,
            min: -0.25,
            max: 0.8,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.header;
                if (!block) return;
                block.gap = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Header Offset X (m)',
            value: this._state.decoration?.header?.offset?.x ?? 0.0,
            min: -2.0,
            max: 2.0,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.header;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), x: v };
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Header Offset Y (m)',
            value: this._state.decoration?.header?.offset?.y ?? 0.0,
            min: -2.0,
            max: 2.0,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.header;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), y: v };
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Header Offset Z (m)',
            value: this._state.decoration?.header?.offset?.z ?? 0.002,
            min: -0.25,
            max: 0.25,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.header;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), z: v };
                this._emit();
            }
        }).row);

        buildShadowControls('Header', 'header');
        buildMaterialControls('Header', 'header');

        addTitle('Trim / Casing');
        section.appendChild(makeToggleRow({
            label: 'Trim Enabled',
            value: !!this._state.decoration?.trim?.enabled,
            onChange: (v) => {
                const block = this._state.decoration?.trim;
                if (!block) return;
                block.enabled = !!v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Trim Band Width (m)',
            value: this._state.decoration?.trim?.bandWidth ?? 0.08,
            min: 0.0,
            max: 0.6,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.trim;
                if (!block) return;
                block.bandWidth = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Trim Inner Gap (m)',
            value: this._state.decoration?.trim?.innerGap ?? 0.005,
            min: 0.0,
            max: 0.1,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.trim;
                if (!block) return;
                block.innerGap = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Trim Depth (m)',
            value: this._state.decoration?.trim?.depth ?? 0.04,
            min: 0.001,
            max: 1.0,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.trim;
                if (!block) return;
                block.depth = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Trim Offset X (m)',
            value: this._state.decoration?.trim?.offset?.x ?? 0.0,
            min: -2.0,
            max: 2.0,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.trim;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), x: v };
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Trim Offset Y (m)',
            value: this._state.decoration?.trim?.offset?.y ?? 0.0,
            min: -2.0,
            max: 2.0,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.trim;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), y: v };
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Trim Offset Z (m)',
            value: this._state.decoration?.trim?.offset?.z ?? 0.002,
            min: -0.25,
            max: 0.25,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const block = this._state.decoration?.trim;
                if (!block) return;
                block.offset = { ...(block.offset ?? {}), z: v };
                this._emit();
            }
        }).row);

        buildShadowControls('Trim', 'trim');
        buildMaterialControls('Trim', 'trim');
    }

    _buildInteriorSection() {
        const section = this._buildSection('Interior');
        const s0 = this._state.settings;
        const atlasOptions = getWindowInteriorAtlasOptions({ includeProcedural: true });
        const initialAtlasId = String(s0.interior.atlasId ?? atlasOptions[0]?.id ?? '');

        section.appendChild(makeToggleRow({
            label: 'Enabled',
            value: s0.interior.enabled,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, enabled: v } });
            }
        }).row);

        section.appendChild(makeSelectRow({
            label: 'Atlas',
            value: initialAtlasId,
            options: atlasOptions,
            onChange: (id) => {
                const s = this._state.settings;
                const selected = String(id ?? '');
                this._setSettings({ interior: { ...s.interior, atlasId: selected } });
            }
        }).row);

        section.appendChild(makeToggleRow({
            label: 'Randomize Cell',
            value: s0.interior.randomizeCell,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, randomizeCell: v } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Cell Col',
            value: s0.interior.cell.col,
            min: 0,
            max: Math.max(0, s0.interior.atlas.cols - 1),
            step: 1,
            digits: 0,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, cell: { ...s.interior.cell, col: Math.round(v) } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Cell Row',
            value: s0.interior.cell.row,
            min: 0,
            max: Math.max(0, s0.interior.atlas.rows - 1),
            step: 1,
            digits: 0,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, cell: { ...s.interior.cell, row: Math.round(v) } } });
            }
        }).row);

        section.appendChild(makeToggleRow({
            label: 'Random Flip X',
            value: s0.interior.randomFlipX,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, randomFlipX: v } });
            }
        }).row);

	        section.appendChild(makeNumberSliderRow({
	            label: 'Parallax Depth (m)',
	            value: s0.interior.parallaxDepthMeters,
	            min: 0.0,
	            max: 50.0,
	            step: 0.1,
	            digits: 1,
	            onChange: (v) => {
	                const s = this._state.settings;
	                this._setSettings({ interior: { ...s.interior, parallaxDepthMeters: v } });
	            }
	        }).row);

	        section.appendChild(makeNumberSliderRow({
	            label: 'Plane Z Offset (m)',
	            value: s0.interior.zOffset,
	            min: -1.0,
	            max: 1.0,
	            step: 0.001,
	            digits: 3,
	            onChange: (v) => {
	                const s = this._state.settings;
	                this._setSettings({ interior: { ...s.interior, zOffset: v } });
	            }
	        }).row);

	        section.appendChild(makeNumberSliderRow({
	            label: 'Interior Zoom',
	            value: s0.interior.uvZoom,
	            min: 0.25,
	            max: 10.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, uvZoom: v } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Interior Aspect (W/H)',
            value: s0.interior.imageAspect,
            min: 0.25,
            max: 4.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, imageAspect: v } });
            }
        }).row);

	        section.appendChild(makeNumberSliderRow({
	            label: 'Parallax Offset X Scale',
	            value: s0.interior.parallaxScale.x,
	            min: 0.0,
	            max: 10.0,
	            step: 0.01,
	            digits: 2,
	            onChange: (v) => {
	                const s = this._state.settings;
                const ps = s.interior.parallaxScale;
                this._setSettings({ interior: { ...s.interior, parallaxScale: { ...ps, x: v } } });
            }
        }).row);

	        section.appendChild(makeNumberSliderRow({
	            label: 'Parallax Offset Y Scale',
	            value: s0.interior.parallaxScale.y,
	            min: 0.0,
	            max: 10.0,
	            step: 0.01,
	            digits: 2,
	            onChange: (v) => {
	                const s = this._state.settings;
                const ps = s.interior.parallaxScale;
                this._setSettings({ interior: { ...s.interior, parallaxScale: { ...ps, y: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Emissive Intensity',
            value: s0.interior.emissiveIntensity,
            min: 0.0,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, emissiveIntensity: v } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'UV Pan X',
            value: s0.interior.uvPan.x,
            min: -2.0,
            max: 2.0,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, uvPan: { ...s.interior.uvPan, x: v } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'UV Pan Y',
            value: s0.interior.uvPan.y,
            min: -2.0,
            max: 2.0,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, uvPan: { ...s.interior.uvPan, y: v } } });
            }
        }).row);

        const t0 = s0.interior.tintVariation;
        section.appendChild(makeNumberSliderRow({
            label: 'Hue Shift Min (deg)',
            value: t0.hueShiftDeg.min,
            min: -180.0,
            max: 180.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                const s = this._state.settings;
                const t = s.interior.tintVariation;
                this._setSettings({ interior: { ...s.interior, tintVariation: { ...t, hueShiftDeg: { ...t.hueShiftDeg, min: v } } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Hue Shift Max (deg)',
            value: t0.hueShiftDeg.max,
            min: -180.0,
            max: 180.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                const s = this._state.settings;
                const t = s.interior.tintVariation;
                this._setSettings({ interior: { ...s.interior, tintVariation: { ...t, hueShiftDeg: { ...t.hueShiftDeg, max: v } } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sat Mul Min',
            value: t0.saturationMul.min,
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const t = s.interior.tintVariation;
                this._setSettings({ interior: { ...s.interior, tintVariation: { ...t, saturationMul: { ...t.saturationMul, min: v } } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Sat Mul Max',
            value: t0.saturationMul.max,
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const t = s.interior.tintVariation;
                this._setSettings({ interior: { ...s.interior, tintVariation: { ...t, saturationMul: { ...t.saturationMul, max: v } } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Bri Mul Min',
            value: t0.brightnessMul.min,
            min: 0.0,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const t = s.interior.tintVariation;
                this._setSettings({ interior: { ...s.interior, tintVariation: { ...t, brightnessMul: { ...t.brightnessMul, min: v } } } });
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Bri Mul Max',
            value: t0.brightnessMul.max,
            min: 0.0,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                const t = s.interior.tintVariation;
                this._setSettings({ interior: { ...s.interior, tintVariation: { ...t, brightnessMul: { ...t.brightnessMul, max: v } } } });
            }
        }).row);

        const overlayToggle = makeToggleRow({
            label: 'Cell Overlay',
            value: this._interiorOverlayEnabled,
            onChange: (v) => {
                this._interiorOverlayEnabled = !!v;
                this._renderInteriorOverlay();
            }
        });
        section.appendChild(overlayToggle.row);

        const pre = document.createElement('pre');
        pre.className = 'options-note hidden';
        section.appendChild(pre);
        this._interiorOverlayPre = pre;
    }
}
