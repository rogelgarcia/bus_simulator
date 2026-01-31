// src/graphics/gui/terrain_debugger/view/TerrainDebuggerUI.js
// Docked tabbed panel for the Terrain Debugger.
// @ts-check

import { DEFAULT_IBL_ID, getIblOptions } from '../../../content3d/catalogs/IBLCatalog.js';
import { getPbrMaterialOptionsForGround } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { createDefaultGrassEngineConfig } from '../../../engine3d/grass/GrassConfig.js';
import { PickerPopup } from '../../shared/PickerPopup.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    const fb = fallback === undefined ? min : fallback;
    if (!Number.isFinite(num)) return fb;
    return Math.max(min, Math.min(max, num));
}

function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function applyTooltip(node, text) {
    const el = node && typeof node === 'object' ? node : null;
    const t = typeof text === 'string' ? text.trim() : '';
    if (!el || !t) return;
    el.title = t;
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj;
}

function normalizeHexColor(value) {
    const raw = String(value ?? '').trim();
    const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return null;
    return `#${m[1].toUpperCase()}`;
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
    applyTooltip(left, tooltip);
    applyTooltip(toggle, tooltip);
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
    applyTooltip(left, tooltip);
    applyTooltip(select, tooltip);
    return { row, select };
}

function makeChoiceRow({ label, value = '', options = [], tooltip = '', onChange }) {
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
        applyTooltip(btn, tooltip);
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
    applyTooltip(left, tooltip);
    applyTooltip(group, tooltip);
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
    applyTooltip(left, tooltip);
    applyTooltip(range, tooltip);
    applyTooltip(number, tooltip);
    return { row, range, number };
}

function makeTextRow({ label, value = '', placeholder = '', tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'options-number';
    input.value = String(value ?? '');
    if (placeholder) input.placeholder = String(placeholder);

    input.addEventListener('change', () => onChange?.(String(input.value)));
    input.addEventListener('blur', () => onChange?.(String(input.value)));

    right.appendChild(input);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(input, tooltip);
    return { row, input };
}

function makeColorRow({ label, value = '#FFFFFF', tooltip = '', onChange }) {
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
    applyTooltip(left, tooltip);
    applyTooltip(color, tooltip);
    applyTooltip(text, tooltip);
    return { row, color, text };
}

function makeButtonRow({ label, text = 'Action', tooltip = '', onClick }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');
    const btn = makeEl('button', 'options-btn options-btn-primary', text);
    btn.type = 'button';
    btn.addEventListener('click', () => onClick?.());
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    applyTooltip(left, tooltip);
    applyTooltip(btn, tooltip);
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
    applyTooltip(left, tooltip);
    applyTooltip(btn, tooltip);
    return { row, btn, thumb, textEl };
}

function getPatternTypeLabel(type) {
    const t = String(type ?? 'linear');
    if (t === 'contrast') return 'Noise (Contrast)';
    if (t === 'soft') return 'Noise (Soft)';
    if (t === 'threshold') return 'Noise (Threshold)';
    return 'Noise (Linear)';
}

function getAntiTilingLabel(mode) {
    const m = String(mode ?? 'fast');
    return m === 'quality' ? 'Quality' : 'Fast';
}

function pickNextPatternType(layers) {
    const used = new Set();
    for (const layer of Array.isArray(layers) ? layers : []) {
        if (!layer || typeof layer !== 'object') continue;
        if (layer.kind !== 'pattern') continue;
        if (layer.enabled === false) continue;
        used.add(String(layer.patternType ?? 'linear'));
    }
    const order = ['linear', 'soft', 'contrast', 'threshold'];
    for (const t of order) if (!used.has(t)) return t;
    return 'linear';
}

export class TerrainDebuggerUI {
    constructor({
        initialState,
        onChange,
        onResetCamera,
        onCameraPreset,
        onToggleFlyover,
        onFlyoverLoopChange,
        onInspectGrass,
        onInspectGrassLod
    } = {}) {
        this._terrainTileSize = 24;
        this._terrainBaseDepthTiles = 16;
        this._syncCloudTilesMax = null;
        this._syncDrawDistanceForTerrain = null;

        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onResetCamera = typeof onResetCamera === 'function' ? onResetCamera : null;
        this._onCameraPreset = typeof onCameraPreset === 'function' ? onCameraPreset : null;
        this._onToggleFlyover = typeof onToggleFlyover === 'function' ? onToggleFlyover : null;
        this._onFlyoverLoopChange = typeof onFlyoverLoopChange === 'function' ? onFlyoverLoopChange : null;
        this._onInspectGrass = typeof onInspectGrass === 'function' ? onInspectGrass : null;
        this._onInspectGrassLod = typeof onInspectGrassLod === 'function' ? onInspectGrassLod : null;
        this._isSetting = false;
        this._sectionCollapsed = new Map();

        const groundOptions = getPbrMaterialOptionsForGround();
        const defaultGround = groundOptions[0]?.id ?? '';

        const defaultLayers = [
            {
                id: 'layer_1',
                kind: 'anti_tiling',
                enabled: true,
                mode: 'fast',
                strength: 0.55,
                cellSize: 2.0,
                blendWidth: 0.2,
                offsetU: 0.22,
                offsetV: 0.22,
                rotationDegrees: 18.0,
                collapsed: false
            }
        ];
        this._nextLayerId = 2;

        this._state = {
            tab: 'environment',
            ibl: {
                enabled: true,
                iblId: DEFAULT_IBL_ID,
                setBackground: true,
                envMapIntensity: 0.25
            },
            exposure: 1.0,
            camera: {
                drawDistance: 1200,
                presetId: 'low',
                flyoverLoop: false
            },
            terrain: {
                layout: {
                    extraEndTiles: 5,
                    extraSideTiles: 0
                },
                slope: {
                    leftDeg: 15,
                    rightDeg: 30,
                    endDeg: 0,
                    endStartAfterRoadTiles: 0
                },
                groundMaterialId: defaultGround,
                showGrid: false,
                uv: {
                    scale: 1.0,
                    scaleU: 1.0,
                    scaleV: 1.0,
                    offsetU: 0.0,
                    offsetV: 0.0,
                    rotationDegrees: 0.0
                },
                uvDistance: {
                    enabled: true,
                    farScale: 0.35,
                    farScaleU: 1.0,
                    farScaleV: 1.0,
                    blendStartMeters: 45,
                    blendEndMeters: 220,
                    macroWeight: 1.0,
                    debugView: 'blended'
                },
                cloud: {
                    enabled: true,
                    amplitude: 7.5,
                    worldScale: 0.06,
                    tiles: 5,
                    blendMeters: 32
                },
                pbr: {
                    normalStrength: 1.0,
                    roughness: 1.0,
                    albedoBrightness: 1.0,
                    albedoHueDegrees: 0.0,
                    albedoSaturation: 0.0,
                    albedoTintStrength: 0.0
                },
                variation: {
                    nearIntensity: 1.0,
                    farIntensity: 0.55
                },
                layers: defaultLayers
            },
            grass: createDefaultGrassEngineConfig(),
            ...(initialState ?? {})
        };

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-terrain-debugger';

        this._pickerPopup = new PickerPopup();

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const title = makeEl('div', 'options-title', 'Terrain Debugger');
        const subtitle = makeEl('div', 'options-subtitle', 'LMB look · RMB orbit · MMB pan · WASD/Arrow keys move · Shift = fast · Wheel dolly · F frame · R reset');
        header.appendChild(title);
        header.appendChild(subtitle);

        this.tabs = makeEl('div', 'options-tabs');
        this._tabButtons = {
            environment: makeEl('button', 'options-tab', 'Environment'),
            terrain: makeEl('button', 'options-tab', 'Terrain'),
            variation: makeEl('button', 'options-tab', 'Variation'),
            grass: makeEl('button', 'options-tab', 'Grass')
        };
        for (const [key, btn] of Object.entries(this._tabButtons)) {
            btn.type = 'button';
            btn.addEventListener('click', () => this.setTab(key));
            this.tabs.appendChild(btn);
        }

        this.body = makeEl('div', 'options-body');
        this._tabBodies = {
            environment: makeEl('div', null),
            terrain: makeEl('div', null),
            variation: makeEl('div', null),
            grass: makeEl('div', null)
        };
        this.body.appendChild(this._tabBodies.environment);
        this.body.appendChild(this._tabBodies.terrain);
        this.body.appendChild(this._tabBodies.variation);
        this.body.appendChild(this._tabBodies.grass);

        this.panel.appendChild(header);
        this.panel.appendChild(this.tabs);
        this.panel.appendChild(this.body);
        this.root.appendChild(this.panel);

        this._controls = {};
        this._buildEnvironmentTab();
        this._buildTerrainTab();
        this._buildVariationTab();
        this._buildGrassTab();

        this.setTab(this._state.tab);

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

    setGrassConfig(nextGrass, { emit = true } = {}) {
        const next = nextGrass && typeof nextGrass === 'object' ? nextGrass : null;
        if (!next) return;

        this._isSetting = true;
        this._state.grass = deepClone(next);

        const grass = this._state.grass;
        const setSlider = (ctrl, value, digits) => {
            if (!ctrl?.range || !ctrl?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            ctrl.range.value = String(v);
            ctrl.number.value = String(Number.isFinite(digits) ? v.toFixed(digits) : v);
        };

        setSlider(this._controls?.grassRoughness, grass?.material?.roughness, 2);
        setSlider(this._controls?.grassMetalness, grass?.material?.metalness, 2);

        setSlider(this._controls?.grassBladesPerTuft, grass?.geometry?.tuft?.bladesPerTuft, 0);
        setSlider(this._controls?.grassTuftRadius, grass?.geometry?.tuft?.radius, 2);
        setSlider(this._controls?.grassBladeWidth, grass?.geometry?.blade?.width, 3);
        setSlider(this._controls?.grassHeightMult, grass?.geometry?.blade?.height, 2);

        setSlider(this._controls?.grassFieldHeightMin, grass?.field?.height?.min, 2);
        setSlider(this._controls?.grassFieldHeightMax, grass?.field?.height?.max, 2);

        setSlider(this._controls?.grassDensityMasterMul, grass?.density?.masterMul, 2);
        setSlider(this._controls?.grassDensityNearMul, grass?.density?.nearMul, 2);
        setSlider(this._controls?.grassDensityMidMul, grass?.density?.midMul, 2);
        setSlider(this._controls?.grassDensityFarMul, grass?.density?.farMul, 2);

        const render = grass?.lod?.renderMode ?? {};
        if (this._controls?.grassRenderModeMaster?.select) this._controls.grassRenderModeMaster.select.value = String(render.master ?? 'tuft');
        if (this._controls?.grassRenderModeNear?.select) this._controls.grassRenderModeNear.select.value = String(render.near ?? 'star');
        if (this._controls?.grassRenderModeMid?.select) this._controls.grassRenderModeMid.select.value = String(render.mid ?? 'cross');
        if (this._controls?.grassRenderModeFar?.select) this._controls.grassRenderModeFar.select.value = String(render.far ?? 'cross_sparse');

        this._isSetting = false;
        if (emit) this._emit();
    }

    setTab(key) {
        const next = (key === 'terrain' || key === 'variation' || key === 'grass') ? key : 'environment';
        this._state.tab = next;
        for (const [id, btn] of Object.entries(this._tabButtons)) btn.classList.toggle('is-active', id === next);
        for (const [id, body] of Object.entries(this._tabBodies)) body.style.display = id === next ? '' : 'none';
        this._emit();
    }

    setTerrainMeta({ tileSize, baseDepthTiles } = {}) {
        const nextTileSize = Number(tileSize);
        if (Number.isFinite(nextTileSize) && nextTileSize > 0) this._terrainTileSize = nextTileSize;

        const nextBaseDepthTiles = Math.round(Number(baseDepthTiles));
        if (Number.isFinite(nextBaseDepthTiles) && nextBaseDepthTiles > 0) this._terrainBaseDepthTiles = nextBaseDepthTiles;

        this._syncCloudTilesMax?.();
        this._syncDrawDistanceForTerrain?.();
    }

    _emit() {
        if (this._isSetting) return;
        this._onChange?.(this.getState());
    }

    _buildSection(tabKey, titleText) {
        const sectionId = `${String(tabKey)}:${String(titleText)}`;
        let collapsed = this._sectionCollapsed.get(sectionId) === true;

        const applyCollapsed = (section, collapseBtn) => {
            section.classList.toggle('is-collapsed', collapsed);
            collapseBtn.textContent = collapsed ? '▸' : '▾';
            collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
            collapseBtn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
        };

        const preserveScroll = (fn) => {
            const body = this.body;
            const scrollTop = Number(body?.scrollTop) || 0;
            const scrollLeft = Number(body?.scrollLeft) || 0;
            fn?.();
            if (!body) return;
            body.scrollTop = scrollTop;
            body.scrollLeft = scrollLeft;
        };

        const section = makeEl('div', 'options-section');
        const header = makeEl('div', 'options-section-header');
        header.setAttribute('role', 'button');
        header.tabIndex = 0;

        const title = makeEl('div', 'options-section-title', titleText);
        const collapseBtn = makeEl('button', 'options-btn options-btn-small options-icon-btn', collapsed ? '▸' : '▾');
        collapseBtn.type = 'button';
        collapseBtn.addEventListener('click', () => {
            preserveScroll(() => {
                collapsed = !collapsed;
                this._sectionCollapsed.set(sectionId, collapsed);
                applyCollapsed(section, collapseBtn);
            });
        });

        header.appendChild(title);
        header.appendChild(collapseBtn);
        header.addEventListener('click', (e) => {
            const btn = e?.target?.closest?.('button');
            if (btn && header.contains(btn)) return;
            preserveScroll(() => {
                collapsed = !collapsed;
                this._sectionCollapsed.set(sectionId, collapsed);
                applyCollapsed(section, collapseBtn);
            });
        });
        header.addEventListener('keydown', (e) => {
            const key = e?.key ?? '';
            if (key !== 'Enter' && key !== ' ') return;
            e.preventDefault?.();
            preserveScroll(() => {
                collapsed = !collapsed;
                this._sectionCollapsed.set(sectionId, collapsed);
                applyCollapsed(section, collapseBtn);
            });
        });

        section.appendChild(header);
        this._tabBodies[tabKey].appendChild(section);
        applyCollapsed(section, collapseBtn);
        return section;
    }

    _buildEnvironmentTab() {
        const section = this._buildSection('environment', 'IBL');

        const enabledRow = makeToggleRow({
            label: 'IBL Enabled',
            value: this._state.ibl.enabled,
            onChange: (v) => {
                this._state.ibl.enabled = !!v;
                const disabled = !this._state.ibl.enabled;
                iblRow.select.disabled = disabled;
                bgRow.toggle.disabled = disabled;
                intensityRow.range.disabled = disabled;
                intensityRow.number.disabled = disabled;
                this._emit();
            }
        });
        section.appendChild(enabledRow.row);
        this._controls.iblEnabled = enabledRow;

        const iblRow = makeSelectRow({
            label: 'HDRI',
            value: this._state.ibl.iblId,
            options: getIblOptions(),
            onChange: (id) => {
                this._state.ibl.iblId = String(id ?? DEFAULT_IBL_ID);
                this._emit();
            }
        });
        section.appendChild(iblRow.row);
        this._controls.iblId = iblRow;

        const bgRow = makeToggleRow({
            label: 'Background',
            value: this._state.ibl.setBackground,
            onChange: (v) => {
                this._state.ibl.setBackground = !!v;
                this._emit();
            }
        });
        section.appendChild(bgRow.row);
        this._controls.iblBackground = bgRow;

        const intensityRow = makeNumberSliderRow({
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
        section.appendChild(intensityRow.row);
        this._controls.iblIntensity = intensityRow;

        const exposureSection = this._buildSection('environment', 'Tone Mapping');
        const exposureRow = makeNumberSliderRow({
            label: 'Exposure',
            value: this._state.exposure,
            min: 0.1,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.exposure = v;
                this._emit();
            }
        });
        exposureSection.appendChild(exposureRow.row);
        this._controls.exposure = exposureRow;

        const terrain = this._state.terrain && typeof this._state.terrain === 'object' ? this._state.terrain : {};
        const layoutState = (terrain.layout && typeof terrain.layout === 'object')
            ? terrain.layout
            : { extraEndTiles: 5, extraSideTiles: 0 };
        terrain.layout = layoutState;
        const slopeState = (terrain.slope && typeof terrain.slope === 'object')
            ? terrain.slope
            : { leftDeg: 15, rightDeg: 30, endDeg: 0, endStartAfterRoadTiles: 0 };
        terrain.slope = slopeState;
        if (!Number.isFinite(slopeState.endStartAfterRoadTiles)) slopeState.endStartAfterRoadTiles = 0;

        const cameraState = (this._state.camera && typeof this._state.camera === 'object')
            ? this._state.camera
            : { drawDistance: 1200, presetId: 'low', flyoverLoop: false };
        this._state.camera = cameraState;
        if (typeof cameraState.presetId !== 'string' || !cameraState.presetId) cameraState.presetId = 'low';
        cameraState.flyoverLoop = !!cameraState.flyoverLoop;

        const tilesSection = this._buildSection('environment', 'Terrain Tiles');
        const gridRow = makeToggleRow({
            label: 'Tile Grid',
            value: this._state.terrain.showGrid,
            onChange: (v) => {
                this._state.terrain.showGrid = !!v;
                this._emit();
            }
        });
        tilesSection.appendChild(gridRow.row);
        this._controls.showGrid = gridRow;

        const getBaseDepthTiles = () => Math.max(1, Math.round(Number(this._terrainBaseDepthTiles) || 16));
        const getTileSize = () => {
            const s = Number(this._terrainTileSize);
            return (Number.isFinite(s) && s > 0) ? s : 24;
        };
        const maxExtraEndTiles = 100;
        layoutState.extraEndTiles = Math.max(0, Math.min(maxExtraEndTiles, Math.round(Number(layoutState.extraEndTiles) || 0)));
        const getMaxCloudTiles = () => Math.max(0, Math.round(getBaseDepthTiles() + (Number(layoutState.extraEndTiles) || 0)));
        const syncCloudTilesMax = () => {
            const row = this._controls.cloudTiles;
            if (!row) return;
            const maxTiles = getMaxCloudTiles();
                row.range.max = String(maxTiles);
                row.number.max = String(maxTiles);
                const clamped = Math.max(0, Math.round(clamp(this._state.terrain.cloud.tiles, 0, maxTiles, 0)));
                if (clamped !== this._state.terrain.cloud.tiles) {
                    this._state.terrain.cloud.tiles = clamped;
                    row.range.value = String(clamped);
                    row.number.value = String(clamped.toFixed(0));
                }
            };
        this._syncCloudTilesMax = syncCloudTilesMax;
        const getDrawDistanceMax = () => {
            const maxDepthTiles = getBaseDepthTiles() + maxExtraEndTiles;
            const maxDepthMeters = maxDepthTiles * getTileSize();
            return Math.max(2000, maxDepthMeters + 4000);
        };
        const getDrawDistanceMinForTerrain = () => {
            const depthTiles = getBaseDepthTiles() + Math.max(0, Math.round(Number(layoutState.extraEndTiles) || 0));
            const depthMeters = depthTiles * getTileSize();
            return Math.max(1200, depthMeters + 600);
        };
        const syncDrawDistanceForTerrain = () => {
            const row = this._controls.drawDistance;
            if (!row) return;
            const minDist = getDrawDistanceMinForTerrain();
            const maxDist = getDrawDistanceMax();
            row.range.max = String(maxDist);
            row.number.max = String(maxDist);
            if (!Number.isFinite(cameraState.drawDistance)) cameraState.drawDistance = minDist;
            const next = clamp(cameraState.drawDistance, 100, maxDist, minDist);
            const bumped = next < minDist ? minDist : next;
            if (bumped !== cameraState.drawDistance) {
                cameraState.drawDistance = bumped;
                row.range.value = String(bumped);
                row.number.value = String(bumped.toFixed(0));
            }
        };
        this._syncDrawDistanceForTerrain = syncDrawDistanceForTerrain;

        const extraEndRow = makeNumberSliderRow({
            label: 'Extra End Tiles (far)',
            value: layoutState.extraEndTiles,
            min: 0,
            max: maxExtraEndTiles,
            step: 1,
            digits: 0,
            onChange: (v) => {
                layoutState.extraEndTiles = Math.round(v);
                syncCloudTilesMax();
                syncDrawDistanceForTerrain();
                this._emit();
            }
        });
        tilesSection.appendChild(extraEndRow.row);
        this._controls.extraEndTiles = extraEndRow;

            const extraSideRow = makeNumberSliderRow({
                label: 'Extra Side Tiles (each)',
                value: layoutState.extraSideTiles,
                min: 0,
                max: 40,
                step: 1,
                digits: 0,
                onChange: (v) => {
                    layoutState.extraSideTiles = Math.round(v);
                    this._emit();
                }
            });
            tilesSection.appendChild(extraSideRow.row);
            this._controls.extraSideTiles = extraSideRow;

            const slopeSection = this._buildSection('environment', 'Terrain Inclination');
            const slopeLeftRow = makeNumberSliderRow({
                label: 'Left Hill (deg)',
                value: slopeState.leftDeg,
                min: 0,
                max: 60,
                step: 0.5,
                digits: 1,
                onChange: (v) => {
                    slopeState.leftDeg = v;
                    this._emit();
                }
            });
            slopeSection.appendChild(slopeLeftRow.row);
            this._controls.slopeLeftDeg = slopeLeftRow;

            const slopeRightRow = makeNumberSliderRow({
                label: 'Right Hill (deg)',
                value: slopeState.rightDeg,
                min: 0,
                max: 60,
                step: 0.5,
                digits: 1,
                onChange: (v) => {
                    slopeState.rightDeg = v;
                    this._emit();
                }
            });
            slopeSection.appendChild(slopeRightRow.row);
            this._controls.slopeRightDeg = slopeRightRow;

            const slopeEndRow = makeNumberSliderRow({
                label: 'End Inclination (deg)',
                value: slopeState.endDeg,
                min: -20,
                max: 20,
                step: 0.25,
                digits: 2,
                onChange: (v) => {
                    slopeState.endDeg = v;
                    this._emit();
                }
            });
            slopeSection.appendChild(slopeEndRow.row);
            this._controls.slopeEndDeg = slopeEndRow;

            const slopeEndStartRow = makeNumberSliderRow({
                label: 'End Hill Start After Road (tiles)',
                value: slopeState.endStartAfterRoadTiles,
                min: 0,
                max: 80,
                step: 1,
                digits: 0,
                onChange: (v) => {
                    slopeState.endStartAfterRoadTiles = Math.max(0, Math.round(v));
                    this._emit();
                }
            });
            slopeSection.appendChild(slopeEndStartRow.row);
            this._controls.slopeEndStartAfterRoadTiles = slopeEndStartRow;

            const cloudSection = this._buildSection('environment', 'Cloud Displacement');
            const cloudState = this._state.terrain.cloud;

            const cloudEnabledRow = makeToggleRow({
                label: 'Enabled',
                value: cloudState.enabled !== false,
                onChange: (v) => {
                    cloudState.enabled = !!v;
                    const disabled = cloudState.enabled === false;
                    ampRow.range.disabled = disabled;
                    ampRow.number.disabled = disabled;
                    scaleRow.range.disabled = disabled;
                    scaleRow.number.disabled = disabled;
                    tilesRow.range.disabled = disabled;
                    tilesRow.number.disabled = disabled;
                    blendRow.range.disabled = disabled;
                    blendRow.number.disabled = disabled;
                    this._emit();
                }
            });
            cloudSection.appendChild(cloudEnabledRow.row);
            this._controls.cloudEnabled = cloudEnabledRow;

            const ampRow = makeNumberSliderRow({
                label: 'Amplitude',
                value: cloudState.amplitude,
                min: 0.0,
                max: 35.0,
                step: 0.1,
                digits: 1,
                onChange: (v) => {
                    cloudState.amplitude = v;
                    this._emit();
                }
            });
            cloudSection.appendChild(ampRow.row);
            this._controls.cloudAmplitude = ampRow;

            const scaleRow = makeNumberSliderRow({
                label: 'World Scale',
                value: cloudState.worldScale,
                min: 0.005,
                max: 0.25,
                step: 0.001,
                digits: 3,
                onChange: (v) => {
                    cloudState.worldScale = v;
                    this._emit();
                }
            });
            cloudSection.appendChild(scaleRow.row);
            this._controls.cloudWorldScale = scaleRow;

            const tilesRow = makeNumberSliderRow({
                label: 'Tiles (from end)',
                value: cloudState.tiles,
                min: 0,
                max: getMaxCloudTiles(),
                step: 1,
                digits: 0,
                onChange: (v) => {
                    cloudState.tiles = Math.max(0, Math.round(v));
                    this._emit();
                }
            });
            cloudSection.appendChild(tilesRow.row);
            this._controls.cloudTiles = tilesRow;

            const blendRow = makeNumberSliderRow({
                label: 'Blend (m)',
                value: cloudState.blendMeters,
                min: 0.0,
                max: 1000.0,
                step: 1.0,
                digits: 0,
                onChange: (v) => {
                    cloudState.blendMeters = v;
                    this._emit();
                }
            });
            cloudSection.appendChild(blendRow.row);
            this._controls.cloudBlendMeters = blendRow;

            const cloudDisabled = cloudState.enabled === false;
            ampRow.range.disabled = cloudDisabled;
            ampRow.number.disabled = cloudDisabled;
            scaleRow.range.disabled = cloudDisabled;
            scaleRow.number.disabled = cloudDisabled;
            tilesRow.range.disabled = cloudDisabled;
            tilesRow.number.disabled = cloudDisabled;
            blendRow.range.disabled = cloudDisabled;
            blendRow.number.disabled = cloudDisabled;
            syncCloudTilesMax();

        const cameraSection = this._buildSection('environment', 'Camera');
        const drawDistanceRow = makeNumberSliderRow({
            label: 'Draw Distance (m)',
            value: cameraState.drawDistance,
            min: 100,
            max: getDrawDistanceMax(),
            step: 10,
            digits: 0,
            onChange: (v) => {
                cameraState.drawDistance = v;
                this._emit();
            }
        });
        cameraSection.appendChild(drawDistanceRow.row);
        this._controls.drawDistance = drawDistanceRow;

        syncDrawDistanceForTerrain();

        const resetRow = makeButtonRow({ label: 'Reset', text: 'Reset Camera', onClick: () => this._onResetCamera?.() });
        cameraSection.appendChild(resetRow.row);
        this._controls.resetCamera = resetRow;

        const presetRow = makeChoiceRow({
            label: 'Presets',
            value: cameraState.presetId,
            options: [
                { id: 'low', label: 'Low' },
                { id: 'high', label: 'High' },
                { id: 'high_far', label: 'High (Far)' },
                { id: 'behind_gameplay', label: 'Behind Bus (Gameplay)' },
                { id: 'behind_low_horizon', label: 'Behind Bus (Low / Horizon)' }
            ],
            onChange: (id) => {
                const nextId = String(id ?? 'low');
                cameraState.presetId = nextId;
                this._emit();
                this._onCameraPreset?.(nextId);
            }
        });
        cameraSection.appendChild(presetRow.row);
        this._controls.cameraPreset = presetRow;

        const flyoverRow = makeButtonRow({
            label: 'Flyover',
            text: 'Start',
            onClick: () => this._onToggleFlyover?.()
        });
        cameraSection.appendChild(flyoverRow.row);
        this._controls.flyoverToggle = flyoverRow;

        const loopRow = makeToggleRow({
            label: 'Loop',
            value: cameraState.flyoverLoop,
            onChange: (v) => {
                cameraState.flyoverLoop = !!v;
                this._onFlyoverLoopChange?.(cameraState.flyoverLoop);
                this._emit();
            }
        });
        cameraSection.appendChild(loopRow.row);
        this._controls.flyoverLoop = loopRow;

        const statusNote = makeEl('div', 'options-note', '');
        cameraSection.appendChild(statusNote);
        this._controls.cameraStatusNote = statusNote;

            const iblDisabled = !this._state.ibl.enabled;
            iblRow.select.disabled = iblDisabled;
            bgRow.toggle.disabled = iblDisabled;
            intensityRow.range.disabled = iblDisabled;
            intensityRow.number.disabled = iblDisabled;
        }

    _buildTerrainTab() {
        const section = this._buildSection('terrain', 'Ground');
        const groundRow = makeGroundMaterialPickerRow({
            label: 'Material',
            onPick: () => this._openGroundMaterialPicker()
        });
        section.appendChild(groundRow.row);
        this._controls.groundMaterialPicker = groundRow;
        this._syncGroundMaterialPicker();

        const uvSection = this._buildSection('terrain', 'UV Tiling');
        const uvScaleRow = makeNumberSliderRow({
            label: 'Scale',
            value: this._state.terrain.uv.scale,
            min: 0.1,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.terrain.uv.scale = v;
                this._emit();
            }
        });
        uvSection.appendChild(uvScaleRow.row);
        this._controls.uvScale = uvScaleRow;

        const uvScaleURow = makeNumberSliderRow({
            label: 'Scale U',
            value: this._state.terrain.uv.scaleU,
            min: 0.1,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.terrain.uv.scaleU = v;
                this._emit();
            }
        });
        uvSection.appendChild(uvScaleURow.row);
        this._controls.uvScaleU = uvScaleURow;

        const uvScaleVRow = makeNumberSliderRow({
            label: 'Scale V',
            value: this._state.terrain.uv.scaleV,
            min: 0.1,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.terrain.uv.scaleV = v;
                this._emit();
            }
        });
        uvSection.appendChild(uvScaleVRow.row);
        this._controls.uvScaleV = uvScaleVRow;

        const uvRotRow = makeNumberSliderRow({
            label: 'Rotation (deg)',
            value: this._state.terrain.uv.rotationDegrees,
            min: -180,
            max: 180,
            step: 0.5,
            digits: 1,
            onChange: (v) => {
                this._state.terrain.uv.rotationDegrees = v;
                this._emit();
            }
        });
        uvSection.appendChild(uvRotRow.row);
        this._controls.uvRotationDegrees = uvRotRow;

        const uvOffsetURow = makeNumberSliderRow({
            label: 'Offset U',
            value: this._state.terrain.uv.offsetU,
            min: -10.0,
            max: 10.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.terrain.uv.offsetU = v;
                this._emit();
            }
        });
        uvSection.appendChild(uvOffsetURow.row);
        this._controls.uvOffsetU = uvOffsetURow;

        const uvOffsetVRow = makeNumberSliderRow({
            label: 'Offset V',
            value: this._state.terrain.uv.offsetV,
            min: -10.0,
            max: 10.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.terrain.uv.offsetV = v;
                this._emit();
            }
        });
        uvSection.appendChild(uvOffsetVRow.row);
        this._controls.uvOffsetV = uvOffsetVRow;

        const distSection = this._buildSection('terrain', 'Distance Scaling');
        const uvDistanceState = (this._state.terrain.uvDistance && typeof this._state.terrain.uvDistance === 'object') ? this._state.terrain.uvDistance : {};
        this._state.terrain.uvDistance = uvDistanceState;
        if (uvDistanceState.enabled === undefined) uvDistanceState.enabled = true;
        if (!Number.isFinite(uvDistanceState.farScale)) uvDistanceState.farScale = 0.35;
        if (!Number.isFinite(uvDistanceState.farScaleU)) uvDistanceState.farScaleU = 1.0;
        if (!Number.isFinite(uvDistanceState.farScaleV)) uvDistanceState.farScaleV = 1.0;
        if (!Number.isFinite(uvDistanceState.blendStartMeters)) uvDistanceState.blendStartMeters = 45;
        if (!Number.isFinite(uvDistanceState.blendEndMeters)) uvDistanceState.blendEndMeters = 220;
        if (!Number.isFinite(uvDistanceState.macroWeight)) uvDistanceState.macroWeight = 1.0;
        if (typeof uvDistanceState.debugView !== 'string') uvDistanceState.debugView = 'blended';

        const distEnabledRow = makeToggleRow({
            label: 'Enabled',
            value: !!uvDistanceState.enabled,
            onChange: (v) => {
                uvDistanceState.enabled = !!v;
                syncDistanceDisabled();
                this._emit();
            }
        });
        distSection.appendChild(distEnabledRow.row);

        const distFarScaleRow = makeNumberSliderRow({
            label: 'Far Scale',
            value: Number(uvDistanceState.farScale),
            min: 0.05,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                uvDistanceState.farScale = v;
                this._emit();
            }
        });
        distSection.appendChild(distFarScaleRow.row);

        const distFarScaleURow = makeNumberSliderRow({
            label: 'Far Scale U',
            value: Number(uvDistanceState.farScaleU),
            min: 0.05,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                uvDistanceState.farScaleU = v;
                this._emit();
            }
        });
        distSection.appendChild(distFarScaleURow.row);

        const distFarScaleVRow = makeNumberSliderRow({
            label: 'Far Scale V',
            value: Number(uvDistanceState.farScaleV),
            min: 0.05,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                uvDistanceState.farScaleV = v;
                this._emit();
            }
        });
        distSection.appendChild(distFarScaleVRow.row);

        const distBlendStartRow = makeNumberSliderRow({
            label: 'Blend Start (m)',
            value: Number(uvDistanceState.blendStartMeters),
            min: 0.0,
            max: 5000.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                uvDistanceState.blendStartMeters = v;
                this._emit();
            }
        });
        distSection.appendChild(distBlendStartRow.row);

        const distBlendEndRow = makeNumberSliderRow({
            label: 'Blend End (m)',
            value: Number(uvDistanceState.blendEndMeters),
            min: 0.0,
            max: 5000.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                uvDistanceState.blendEndMeters = v;
                this._emit();
            }
        });
        distSection.appendChild(distBlendEndRow.row);

        const distMacroWeightRow = makeNumberSliderRow({
            label: 'Macro Weight',
            value: Number(uvDistanceState.macroWeight),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                uvDistanceState.macroWeight = v;
                this._emit();
            }
        });
        distSection.appendChild(distMacroWeightRow.row);

        const debugViewRow = makeChoiceRow({
            label: 'View',
            value: String(uvDistanceState.debugView ?? 'blended'),
            options: [
                { id: 'blended', label: 'Blended' },
                { id: 'micro', label: 'Micro Only' },
                { id: 'macro', label: 'Macro Only' }
            ],
            onChange: (id) => {
                uvDistanceState.debugView = String(id ?? 'blended');
                this._emit();
            }
        });
        distSection.appendChild(debugViewRow.row);

        const syncDistanceDisabled = () => {
            const disabled = !uvDistanceState.enabled;
            distFarScaleRow.range.disabled = disabled;
            distFarScaleRow.number.disabled = disabled;
            distFarScaleURow.range.disabled = disabled;
            distFarScaleURow.number.disabled = disabled;
            distFarScaleVRow.range.disabled = disabled;
            distFarScaleVRow.number.disabled = disabled;
            distBlendStartRow.range.disabled = disabled;
            distBlendStartRow.number.disabled = disabled;
            distBlendEndRow.range.disabled = disabled;
            distBlendEndRow.number.disabled = disabled;
            distMacroWeightRow.range.disabled = disabled;
            distMacroWeightRow.number.disabled = disabled;
            debugViewRow.setDisabled(disabled);
        };
        syncDistanceDisabled();

        const pbrSection = this._buildSection('terrain', 'PBR');
        const terrainState = this._state.terrain;
        const pbrState = (terrainState.pbr && typeof terrainState.pbr === 'object') ? terrainState.pbr : {};
        terrainState.pbr = pbrState;
        if (!Number.isFinite(pbrState.normalStrength)) pbrState.normalStrength = 1.0;
        if (!Number.isFinite(pbrState.roughness)) pbrState.roughness = 1.0;
        if (!Number.isFinite(pbrState.albedoBrightness)) pbrState.albedoBrightness = 1.0;
        if (!Number.isFinite(pbrState.albedoHueDegrees)) pbrState.albedoHueDegrees = 0.0;
        if (!Number.isFinite(pbrState.albedoSaturation)) pbrState.albedoSaturation = 0.0;
        if (!Number.isFinite(pbrState.albedoTintStrength)) pbrState.albedoTintStrength = 0.0;

        const normalRow = makeNumberSliderRow({
            label: 'Normal Strength',
            value: Number(pbrState.normalStrength) || 0,
            min: 0.0,
            max: 4.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                pbrState.normalStrength = v;
                this._emit();
            }
        });
        pbrSection.appendChild(normalRow.row);
        this._controls.pbrNormalStrength = normalRow;

        const roughRow = makeNumberSliderRow({
            label: 'Roughness',
            value: Number(pbrState.roughness),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                pbrState.roughness = v;
                this._emit();
            }
        });
        pbrSection.appendChild(roughRow.row);
        this._controls.pbrRoughness = roughRow;

        const albedoBrightnessRow = makeNumberSliderRow({
            label: 'Albedo Brightness',
            value: Number(pbrState.albedoBrightness),
            min: 0.0,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                pbrState.albedoBrightness = v;
                this._emit();
            }
        });
        pbrSection.appendChild(albedoBrightnessRow.row);
        this._controls.pbrAlbedoBrightness = albedoBrightnessRow;

        const albedoTintRow = makeNumberSliderRow({
            label: 'Albedo Tint Strength',
            value: Number(pbrState.albedoTintStrength),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                pbrState.albedoTintStrength = v;
                this._emit();
            }
        });
        pbrSection.appendChild(albedoTintRow.row);
        this._controls.pbrAlbedoTintStrength = albedoTintRow;

        const ensureAlbedoTintStrength = () => {
            const strength = Number(pbrState.albedoTintStrength) || 0;
            if (strength > 0) return;
            const next = 0.5;
            pbrState.albedoTintStrength = next;
            albedoTintRow.range.value = String(next);
            albedoTintRow.number.value = String(next.toFixed(2));
        };

        const albedoHueRow = makeNumberSliderRow({
            label: 'Albedo Tint Hue (deg)',
            value: Number(pbrState.albedoHueDegrees),
            min: -180.0,
            max: 180.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                pbrState.albedoHueDegrees = v;
                ensureAlbedoTintStrength();
                this._emit();
            }
        });
        pbrSection.appendChild(albedoHueRow.row);
        this._controls.pbrAlbedoHueDegrees = albedoHueRow;

        const albedoSatRow = makeNumberSliderRow({
            label: 'Albedo Saturation (adj)',
            value: Number(pbrState.albedoSaturation),
            min: -1.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                pbrState.albedoSaturation = v;
                this._emit();
            }
        });
        pbrSection.appendChild(albedoSatRow.row);
        this._controls.pbrAlbedoSaturation = albedoSatRow;

        pbrSection.appendChild(makeEl('div', 'options-note', 'Saturation is signed (-1..+1). Hue affects the tint (needs Tint Strength > 0).'));
    }

    _buildVariationTab() {
        const section = this._buildSection('variation', 'Variation');
        const terrainState = this._state.terrain;
        const variationState = (terrainState.variation && typeof terrainState.variation === 'object') ? terrainState.variation : {};
        terrainState.variation = variationState;
        if (!Number.isFinite(variationState.nearIntensity)) variationState.nearIntensity = 1.0;
        if (!Number.isFinite(variationState.farIntensity)) variationState.farIntensity = 0.55;

        const nearRow = makeNumberSliderRow({
            label: 'Near Intensity',
            value: Number(variationState.nearIntensity),
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variationState.nearIntensity = v;
                this._emit();
            }
        });
        section.appendChild(nearRow.row);

        const farRow = makeNumberSliderRow({
            label: 'Far Intensity',
            value: Number(variationState.farIntensity),
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variationState.farIntensity = v;
                this._emit();
            }
        });
        section.appendChild(farRow.row);

        section.appendChild(makeEl('div', 'options-note', 'Near/Far blend uses Terrain ▸ Distance Scaling distances.'));

        const layersSection = this._buildSection('variation', 'Layers');

        const addRow = makeEl('div', 'options-row options-row-wide');
        addRow.appendChild(makeEl('div', 'options-row-label', 'Add'));
        const addRight = makeEl('div', 'options-row-control options-row-control-wide');
        const addGroup = makeEl('div', 'options-choice-group');
        const addAnti = makeEl('button', 'options-choice-btn', 'Anti-Tiling');
        addAnti.type = 'button';
        addAnti.addEventListener('click', () => this._addLayer('anti_tiling'));
        const addPattern = makeEl('button', 'options-choice-btn', 'Pattern');
        addPattern.type = 'button';
        addPattern.addEventListener('click', () => this._addLayer('pattern'));
        addGroup.appendChild(addAnti);
        addGroup.appendChild(addPattern);
        addRight.appendChild(addGroup);
        addRow.appendChild(addRight);
        layersSection.appendChild(addRow);

        const host = makeEl('div', null);
        layersSection.appendChild(host);
        this._layersHost = host;
        this._renderVariationLayers();
    }

    _getLayers() {
        const t = this._state?.terrain && typeof this._state.terrain === 'object' ? this._state.terrain : null;
        const layers = Array.isArray(t?.layers) ? t.layers : [];
        return layers;
    }

    _addLayer(kind) {
        const k = kind === 'pattern' ? 'pattern' : 'anti_tiling';
        const layers = this._getLayers().slice(0);
        const id = `layer_${this._nextLayerId++}`;
        if (k === 'pattern') {
            layers.push({
                id,
                kind: 'pattern',
                enabled: true,
                patternType: pickNextPatternType(layers),
                intensity: 0.35,
                scale: 1.0,
                hueDegrees: 0.0,
                value: 0.08,
                saturation: 0.05,
                roughness: 0.12,
                normal: 0.12,
                coverage: 0.65,
                collapsed: false
            });
        } else {
            layers.push({
                id,
                kind: 'anti_tiling',
                enabled: true,
                mode: 'fast',
                strength: 0.55,
                cellSize: 2.0,
                blendWidth: 0.2,
                offsetU: 0.22,
                offsetV: 0.22,
                rotationDegrees: 18.0,
                collapsed: false
            });
        }

        this._state.terrain.layers = layers;
        this._renderVariationLayers();
        this._emit();
    }

    _removeLayer(layerId) {
        const id = String(layerId ?? '');
        if (!id) return;
        const layers = this._getLayers();
        const next = layers.filter((l) => String(l?.id ?? '') !== id);
        this._state.terrain.layers = next;
        this._renderVariationLayers();
        this._emit();
    }

    _renderVariationLayers() {
        const host = this._layersHost;
        if (!host) return;
        const body = this.body;
        const scrollTop = Number(body?.scrollTop) || 0;
        const scrollLeft = Number(body?.scrollLeft) || 0;
        const active = document.activeElement;
        const activeId = (active && active instanceof HTMLElement && active.id && this.root?.contains(active)) ? String(active.id) : '';

        host.replaceChildren();

        const layers = this._getLayers();
        if (!layers.length) {
            host.appendChild(makeEl('div', null, 'No variation layers.'));
            return;
        }

        const makeHeader = ({ layer, index, title, collapsed, summaryText }) => {
            const header = makeEl('div', 'options-layer-header');
            const top = makeEl('div', 'options-layer-header-top');
            top.setAttribute('role', 'button');
            top.tabIndex = 0;

            const titleEl = makeEl('div', 'options-section-title', `${index + 1}. ${title}`);
            const actions = makeEl('div', 'options-layer-header-actions');

            const collapseBtn = makeEl('button', 'options-btn options-btn-small options-icon-btn', collapsed ? '▸' : '▾');
            collapseBtn.type = 'button';
            collapseBtn.id = `layer-${String(layer?.id ?? index)}-collapse`;
            collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
            collapseBtn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
            collapseBtn.addEventListener('click', () => {
                layer.collapsed = !layer.collapsed;
                this._renderVariationLayers();
                this._emit();
            });

            const removeBtn = makeEl('button', 'options-btn options-btn-small', 'Remove');
            removeBtn.type = 'button';
            removeBtn.id = `layer-${String(layer?.id ?? index)}-remove`;
            removeBtn.addEventListener('click', () => this._removeLayer(layer?.id));

            actions.appendChild(collapseBtn);
            actions.appendChild(removeBtn);
            top.appendChild(titleEl);
            top.appendChild(actions);
            top.addEventListener('click', (e) => {
                const btn = e?.target?.closest?.('button');
                if (btn && top.contains(btn)) return;
                layer.collapsed = !layer.collapsed;
                this._renderVariationLayers();
                this._emit();
            });
            top.addEventListener('keydown', (e) => {
                const key = e?.key ?? '';
                if (key !== 'Enter' && key !== ' ') return;
                e.preventDefault?.();
                layer.collapsed = !layer.collapsed;
                this._renderVariationLayers();
                this._emit();
            });
            header.appendChild(top);

            const summary = makeEl('div', 'options-layer-summary');
            summary.textContent = summaryText;
            summary.style.display = collapsed ? '' : 'none';
            header.appendChild(summary);

            return { header };
        };

        layers.forEach((layer, index) => {
            const kind = layer?.kind === 'pattern' ? 'pattern' : 'anti_tiling';
            const title = kind === 'pattern' ? 'Pattern' : 'Anti-Tiling';
            const section = makeEl('div', 'options-section');
            const collapsed = !!layer?.collapsed;
            const summaryText = kind === 'pattern'
                ? getPatternTypeLabel(layer?.patternType)
                : `Mode: ${getAntiTilingLabel(layer?.mode)}`;
            const header = makeHeader({ layer, index, title, collapsed, summaryText });
            section.appendChild(header.header);

            const enabledRow = makeToggleRow({
                label: 'Enabled',
                value: layer?.enabled !== false,
                onChange: (v) => {
                    layer.enabled = !!v;
                    this._renderVariationLayers();
                    this._emit();
                }
            });
            section.appendChild(enabledRow.row);

            const disabled = layer?.enabled === false;
            enabledRow.toggle.id = `layer-${String(layer?.id ?? index)}-enabled`;

            if (collapsed) {
                enabledRow.toggle.disabled = false;
                host.appendChild(section);
                return;
            }

            if (kind === 'anti_tiling') {
                const modeRow = makeChoiceRow({
                    label: 'Mode',
                    value: String(layer?.mode ?? 'fast'),
                    options: [
                        { id: 'fast', label: 'Fast' },
                        { id: 'quality', label: 'Quality' }
                    ],
                    onChange: (id) => {
                        layer.mode = String(id ?? 'fast');
                        this._emit();
                    }
                });
                section.appendChild(modeRow.row);

                const strengthRow = makeNumberSliderRow({
                    label: 'Strength',
                    value: Number(layer?.strength) || 0,
                    min: 0.0,
                    max: 4.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.strength = v;
                        this._emit();
                    }
                });
                section.appendChild(strengthRow.row);

                const cellRow = makeNumberSliderRow({
                    label: 'Cell Size',
                    value: Number(layer?.cellSize) || 0,
                    min: 0.25,
                    max: 12.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.cellSize = v;
                        this._emit();
                    }
                });
                section.appendChild(cellRow.row);

                const blendRow = makeNumberSliderRow({
                    label: 'Blend Width',
                    value: Number(layer?.blendWidth) || 0,
                    min: 0.0,
                    max: 0.49,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.blendWidth = v;
                        this._emit();
                    }
                });
                section.appendChild(blendRow.row);

                const offsetURow = makeNumberSliderRow({
                    label: 'Offset U',
                    value: Number(layer?.offsetU) || 0,
                    min: 0.0,
                    max: 2.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.offsetU = v;
                        this._emit();
                    }
                });
                section.appendChild(offsetURow.row);

                const offsetVRow = makeNumberSliderRow({
                    label: 'Offset V',
                    value: Number(layer?.offsetV) || 0,
                    min: 0.0,
                    max: 2.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.offsetV = v;
                        this._emit();
                    }
                });
                section.appendChild(offsetVRow.row);

                const rotRow = makeNumberSliderRow({
                    label: 'Rotation (deg)',
                    value: Number(layer?.rotationDegrees) || 0,
                    min: 0.0,
                    max: 90.0,
                    step: 0.1,
                    digits: 1,
                    onChange: (v) => {
                        layer.rotationDegrees = v;
                        this._emit();
                    }
                });
                section.appendChild(rotRow.row);

                modeRow.setDisabled(disabled);
                strengthRow.range.disabled = disabled;
                strengthRow.number.disabled = disabled;
                cellRow.range.disabled = disabled;
                cellRow.number.disabled = disabled;
                blendRow.range.disabled = disabled;
                blendRow.number.disabled = disabled;
                offsetURow.range.disabled = disabled;
                offsetURow.number.disabled = disabled;
                offsetVRow.range.disabled = disabled;
                offsetVRow.number.disabled = disabled;
                rotRow.range.disabled = disabled;
                rotRow.number.disabled = disabled;
            } else {
                const typeRow = makeSelectRow({
                    label: 'Type',
                    value: String(layer?.patternType ?? 'linear'),
                    options: [
                        { id: 'contrast', label: 'Noise (Contrast)' },
                        { id: 'linear', label: 'Noise (Linear)' },
                        { id: 'soft', label: 'Noise (Soft)' },
                        { id: 'threshold', label: 'Noise (Threshold)' }
                    ],
                    onChange: (id) => {
                        layer.patternType = String(id ?? 'linear');
                        this._renderVariationLayers();
                        this._emit();
                    }
                });
                section.appendChild(typeRow.row);

                const intensityRow = makeNumberSliderRow({
                    label: 'Intensity',
                    value: Number(layer?.intensity) || 0,
                    min: 0.0,
                    max: 2.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.intensity = v;
                        this._emit();
                    }
                });
                section.appendChild(intensityRow.row);

                const scaleRow = makeNumberSliderRow({
                    label: 'Scale',
                    value: Number(layer?.scale) || 1,
                    min: 0.02,
                    max: 24.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.scale = v;
                        this._emit();
                    }
                });
                section.appendChild(scaleRow.row);

                const hueRow = makeNumberSliderRow({
                    label: 'Hue (deg)',
                    value: Number(layer?.hueDegrees) || 0,
                    min: -60.0,
                    max: 60.0,
                    step: 0.1,
                    digits: 1,
                    onChange: (v) => {
                        layer.hueDegrees = v;
                        this._emit();
                    }
                });
                section.appendChild(hueRow.row);

                const valueRow = makeNumberSliderRow({
                    label: 'Brightness',
                    value: Number(layer?.value) || 0,
                    min: -0.5,
                    max: 0.5,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.value = v;
                        this._emit();
                    }
                });
                section.appendChild(valueRow.row);

                const satRow = makeNumberSliderRow({
                    label: 'Saturation',
                    value: Number(layer?.saturation) || 0,
                    min: -1.0,
                    max: 1.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.saturation = v;
                        this._emit();
                    }
                });
                section.appendChild(satRow.row);

                const roughRow = makeNumberSliderRow({
                    label: 'Roughness',
                    value: Number(layer?.roughness) || 0,
                    min: -0.5,
                    max: 0.5,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.roughness = v;
                        this._emit();
                    }
                });
                section.appendChild(roughRow.row);

                const normalRow = makeNumberSliderRow({
                    label: 'Normal',
                    value: Number(layer?.normal) || 0,
                    min: -0.5,
                    max: 0.5,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.normal = v;
                        this._emit();
                    }
                });
                section.appendChild(normalRow.row);

                const wantsCoverage = String(layer?.patternType ?? '') === 'threshold';
                if (wantsCoverage) {
                    const covRow = makeNumberSliderRow({
                        label: 'Coverage',
                        value: Number(layer?.coverage) || 0,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        digits: 2,
                        onChange: (v) => {
                            layer.coverage = v;
                            this._emit();
                        }
                    });
                    section.appendChild(covRow.row);
                    covRow.range.disabled = disabled;
                    covRow.number.disabled = disabled;
                }

                typeRow.select.disabled = disabled;
                intensityRow.range.disabled = disabled;
                intensityRow.number.disabled = disabled;
                scaleRow.range.disabled = disabled;
                scaleRow.number.disabled = disabled;
                hueRow.range.disabled = disabled;
                hueRow.number.disabled = disabled;
                valueRow.range.disabled = disabled;
                valueRow.number.disabled = disabled;
                satRow.range.disabled = disabled;
                satRow.number.disabled = disabled;
                roughRow.range.disabled = disabled;
                roughRow.number.disabled = disabled;
                normalRow.range.disabled = disabled;
                normalRow.number.disabled = disabled;
            }

            host.appendChild(section);
        });

        if (body) {
            body.scrollTop = scrollTop;
            body.scrollLeft = scrollLeft;
        }
        if (activeId) {
            const esc = globalThis.CSS?.escape ? globalThis.CSS.escape(activeId) : activeId;
            const el = this.root?.querySelector?.(`#${esc}`) ?? null;
            if (el && el instanceof HTMLElement && typeof el.focus === 'function') {
                try {
                    el.focus({ preventScroll: true });
                } catch {
                    el.focus();
                    if (body) {
                        body.scrollTop = scrollTop;
                        body.scrollLeft = scrollLeft;
                    }
                }
            }
        }
    }

    setCameraStatus({
        activePresetId = null,
        flyoverActive = false,
        flyoverTimeSec = 0,
        flyoverDurationSec = 15
    } = {}) {
        const note = this._controls?.cameraStatusNote ?? null;
        if (!note) return;

        const preset = typeof activePresetId === 'string' && activePresetId ? activePresetId : '';
        const presetLabel = this._getCameraPresetLabel(preset) || preset;
        const lines = [];
        if (presetLabel) lines.push(`Preset: ${presetLabel}`);

        const presetControl = this._controls?.cameraPreset ?? null;
        if (typeof presetControl?.setValue === 'function') presetControl.setValue(preset);
        if (presetControl?.select) presetControl.select.value = preset;

        if (flyoverActive) {
            const t = Math.max(0, Number(flyoverTimeSec) || 0);
            const d = Math.max(0.001, Number(flyoverDurationSec) || 15);
            lines.push(`Flyover: ${t.toFixed(1)}s / ${d.toFixed(1)}s`);
        }

        note.textContent = lines.join(' · ');
    }

    setGrassStats({
        enabled = false,
        patches = 0,
        drawCalls = 0,
        totalInstances = 0,
        totalTriangles = 0,
        instancesByTier = null
    } = {}) {
        const controls = this._controls ?? {};
        const inst = controls.grassStatsInstances ?? null;
        const tris = controls.grassStatsTriangles ?? null;
        const calls = controls.grassStatsDrawCalls ?? null;
        const byTier = instancesByTier && typeof instancesByTier === 'object' ? instancesByTier : {};

        if (inst) {
            inst.textContent = enabled
                ? `Instances: ${Math.round(Number(totalInstances) || 0).toLocaleString()} (M ${Math.round(Number(byTier.master) || 0).toLocaleString()} · N ${Math.round(Number(byTier.near) || 0).toLocaleString()} · Mid ${Math.round(Number(byTier.mid) || 0).toLocaleString()} · Far ${Math.round(Number(byTier.far) || 0).toLocaleString()})`
                : 'Instances: (disabled)';
        }
        if (tris) {
            tris.textContent = enabled
                ? `Triangles: ${Math.round(Number(totalTriangles) || 0).toLocaleString()}`
                : 'Triangles: (disabled)';
        }
        if (calls) {
            calls.textContent = enabled
                ? `Draw calls: ${Math.round(Number(drawCalls) || 0).toLocaleString()} (patches: ${Math.round(Number(patches) || 0).toLocaleString()})`
                : 'Draw calls: (disabled)';
        }
    }

    setGrassLodDebugInfo({ viewAngleDeg = null, angleScale = null, masterActiveByAngle = false } = {}) {
        const note = this._controls?.grassLodDebugInfo ?? null;
        if (!note) return;

        const angle = Number(viewAngleDeg);
        const scale = Number(angleScale);
        if (!(Number.isFinite(angle) && Number.isFinite(scale))) {
            note.textContent = 'View angle: (n/a) · AngleScale: (n/a)';
            return;
        }

        const parts = [
            `View angle: ${angle.toFixed(1)}°`,
            `AngleScale: ${scale.toFixed(2)}`,
            `Master: ${masterActiveByAngle ? 'active' : 'inactive'}`
        ];
        note.textContent = parts.join(' · ');
    }

    setFlyoverActive(active) {
        const isActive = !!active;
        const flyover = this._controls?.flyoverToggle ?? null;
        const camPreset = this._controls?.cameraPreset ?? null;
        const reset = this._controls?.resetCamera ?? null;

        if (flyover?.btn) flyover.btn.textContent = isActive ? 'Stop' : 'Start';
        if (typeof camPreset?.setDisabled === 'function') camPreset.setDisabled(isActive);
        if (camPreset?.select) camPreset.select.disabled = isActive;
        if (reset?.btn) reset.btn.disabled = isActive;
    }

    _getCameraPresetLabel(id) {
        const preset = String(id ?? '');
        if (preset === 'custom') return 'Manual';
        if (preset === 'high_far') return 'High (Far)';
        if (preset === 'behind_gameplay') return 'Behind Bus (Gameplay)';
        if (preset === 'behind_low_horizon') return 'Behind Bus (Low / Horizon)';
        if (preset === 'high') return 'High';
        if (preset === 'low') return 'Low';
        return '';
    }

    _buildGrassTab() {
        const grass = this._state.grass;
        const tip = (...lines) => lines.filter((l) => l !== null && l !== undefined).join('\n');

        const lodTips = {
            masterEnabled: tip(
                'Enables the Master (highest quality) LOD tier.',
                '',
                'Master is only used when:',
                '• Master Enabled is ON',
                '• Master Dist > 0',
                '• View angle ≤ Master Max Angle',
                '• Field → Allow Master is ON',
                '• LOD Render Mode → Master is not "None"',
                '',
                'When Master is inactive, Near is used at close range instead.'
            ),
            force: tip(
                'Overrides automatic LOD selection.',
                '',
                'Auto: choose/blend tiers by distance & view angle.',
                'Master/Near/Mid/Far: force a tier everywhere (may be remapped if disallowed).',
                'None: disables grass rendering.',
                '',
                'Note: Field → Force LOD (if not Auto) overrides this.'
            ),
            masterDist: tip(
                'Distance where Master fades into Near (± Transition).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale',
                '(AngleScale depends on Grazing/Top-down settings below).',
                '',
                'Only applies when Master is active (see Master Enabled + Master Max Angle).'
            ),
            nearEnd: tip(
                'End of Near tier. Near blends into Mid around this distance (± Transition).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale'
            ),
            midEnd: tip(
                'End of Mid tier. Mid blends into Far around this distance (± Transition).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale'
            ),
            farEnd: tip(
                'Start of Far fade-out.',
                '',
                'Far becomes dominant after Mid End, then begins fading out at Far End and reaches 0 at Cutoff.',
                'This fade uses the [Far End → Cutoff] interval (Transition does not apply).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale'
            ),
            cutoff: tip(
                'End of grass visibility.',
                '',
                'At/after Cutoff the Far tier weight becomes 0.',
                'If Cutoff == Far End, grass ends abruptly (no fade).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale'
            ),
            transition: tip(
                'Blend width for tier transitions (meters).',
                '',
                'Used as ±Transition around:',
                '• Master Dist',
                '• Near End',
                '• Mid End',
                '',
                'Not used for the Far→Cutoff fade (that uses Far End → Cutoff).'
            ),
            grazingAngle: tip(
                'Lower bound of the AngleScale interpolation range.',
                '',
                'View angle is derived from the camera look direction:',
                '0° = looking at the horizon (grazing)',
                '90° = looking straight down/up (top-down)',
                '',
                'At/below this view angle, AngleScale = Grazing Dist Scale.'
            ),
            topDownAngle: tip(
                'Upper bound of the AngleScale interpolation range.',
                '',
                'View angle is derived from the camera look direction:',
                '0° = looking at the horizon (grazing)',
                '90° = looking straight down/up (top-down)',
                '',
                'At/above this view angle, AngleScale = Top-down Dist Scale.'
            ),
            masterMaxAngle: tip(
                'Disables the Master tier when looking too top-down.',
                '',
                'If ViewAngleDeg > Master Max Angle, Master weight becomes 0 and Near starts at 0m.',
                'Use this to avoid expensive 3D tufts when looking downward.'
            ),
            grazingScale: tip(
                'AngleScale used near the horizon (grazing views).',
                '',
                'EffectiveDistance = WorldDistance × AngleScale.',
                '',
                'Smaller (<1): pushes LOD transitions farther out (more detail for longer).',
                'Larger (>1): pulls transitions closer in (more aggressive LOD).'
            ),
            topDownScale: tip(
                'AngleScale used for top-down views.',
                '',
                'EffectiveDistance = WorldDistance × AngleScale.',
                '',
                'Smaller (<1): pushes LOD transitions farther out (more detail for longer).',
                'Larger (>1): pulls transitions closer in (more aggressive LOD).'
            ),
            renderMode: tip(
                'Chooses the geometry strategy for this LOD tier.',
                '',
                '3D Tuft: true 3D blades (most expensive, best close-up).',
                'Star: 3 intersecting quads (cheaper).',
                'Cross: 2 intersecting quads (cheaper).',
                'Cross (Sparse): same geometry as Cross, intended to be used with a lower density multiplier.',
                'None: disables this tier (it is treated as disallowed).'
            ),
            inspect: tip(
                'Opens a popup inspector for this LOD tier.',
                '',
                'Use it to tweak render mode, density, and blade/tuft/material parameters.',
                'Click Save to write changes back into the main Grass config.'
            ),
            densityMul: tip(
                'Multiplier applied on top of Field Density (tufts/m²) and Global Mul.',
                'Approx instances ≈ fieldDensity × globalMul × tierMul × area.',
                '',
                'Counts are cumulative per patch:',
                'Far ≤ Mid ≤ Near ≤ Master (when Master Enabled).',
                'So setting Near Mul below Mid Mul has no effect.'
            ),
            fieldForce: tip(
                'Per-field LOD override.',
                '',
                'If not Auto, this overrides the global LOD Force setting.',
                'Useful for testing tiers without changing the global config.'
            ),
            fieldAllow: tip(
                'Allows/disallows specific tiers for this field.',
                '',
                'If a tier is disallowed (or its Render Mode is "None"), its weight is reassigned to the nearest allowed tier.',
                'If you disable all tiers, Near is automatically re-enabled.'
            ),
            debugBaseRings: tip(
                'Draws the configured LOD distance thresholds as rings centered on the camera.',
                '',
                'These are the raw distances in the LOD section.',
                'Actual transitions use EFFECTIVE distance (distance × AngleScale), so boundaries can shift with view angle.',
                '',
                'Tip: enable "Angle-scaled LOD Rings" to see the current world-space boundaries.'
            ),
            debugAngleScaledRings: tip(
                'Draws LOD rings converted back into world distance for the CURRENT camera view angle.',
                '',
                'Rings are scaled by 1/AngleScale, so they move as you look up/down.',
                'This visualizes how Grazing/Top-down scales affect LOD distances.'
            )
        };

        const engineSection = this._buildSection('grass', 'Engine');
        engineSection.appendChild(makeToggleRow({
            label: 'Enabled',
            value: grass.enabled,
            onChange: (v) => {
                grass.enabled = !!v;
                this._emit();
            }
        }).row);

        engineSection.appendChild(makeTextRow({
            label: 'Seed',
            value: grass.seed,
            placeholder: 'grass-debugger',
            onChange: (v) => {
                grass.seed = String(v ?? '');
                this._emit();
            }
        }).row);

        engineSection.appendChild(makeNumberSliderRow({
            label: 'Patch Size (m)',
            value: grass.patch.sizeMeters,
            min: 8,
            max: 256,
            step: 1,
            digits: 0,
            onChange: (v) => {
                grass.patch.sizeMeters = Math.round(v);
                this._emit();
            }
        }).row);

        engineSection.appendChild(makeNumberSliderRow({
            label: 'Y Offset',
            value: grass.patch.yOffset,
            min: -0.2,
            max: 0.2,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                grass.patch.yOffset = v;
                this._emit();
            }
        }).row);

        engineSection.appendChild(makeNumberSliderRow({
            label: 'Density Mult',
            value: grass.density.globalMultiplier,
            min: 0.0,
            max: 4.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.globalMultiplier = v;
                this._emit();
            }
        }).row);

        const materialSection = this._buildSection('grass', 'Material');
        const roughnessRow = makeNumberSliderRow({
            label: 'Roughness',
            value: grass.material.roughness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.material.roughness = v;
                this._emit();
            }
        });
        materialSection.appendChild(roughnessRow.row);
        this._controls.grassRoughness = roughnessRow;

        const metalnessRow = makeNumberSliderRow({
            label: 'Metalness',
            value: grass.material.metalness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.material.metalness = v;
                this._emit();
            }
        });
        materialSection.appendChild(metalnessRow.row);
        this._controls.grassMetalness = metalnessRow;

        const bladeSection = this._buildSection('grass', 'Blade');
        bladeSection.appendChild(makeButtonRow({
            label: 'Blade / Tuft',
            text: 'Inspect Grass Blade',
            onClick: () => this._onInspectGrass?.()
        }).row);
        bladeSection.appendChild(makeEl('div', 'options-note', 'Popup uses a separate render buffer.'));

        const bladesPerTuftRow = makeNumberSliderRow({
            label: 'Blades / Tuft',
            value: grass.geometry.tuft.bladesPerTuft,
            min: 1,
            max: 32,
            step: 1,
            digits: 0,
            onChange: (v) => {
                grass.geometry.tuft.bladesPerTuft = Math.round(v);
                this._emit();
            }
        });
        bladeSection.appendChild(bladesPerTuftRow.row);
        this._controls.grassBladesPerTuft = bladesPerTuftRow;

        const tuftRadiusRow = makeNumberSliderRow({
            label: 'Tuft Radius (x width)',
            value: grass.geometry.tuft.radius,
            min: 0.0,
            max: 6.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.geometry.tuft.radius = v;
                this._emit();
            }
        });
        bladeSection.appendChild(tuftRadiusRow.row);
        this._controls.grassTuftRadius = tuftRadiusRow;

        const bladeWidthRow = makeNumberSliderRow({
            label: 'Width (m)',
            value: grass.geometry.blade.width,
            min: 0.001,
            max: 0.05,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                grass.geometry.blade.width = v;
                this._emit();
            }
        });
        bladeSection.appendChild(bladeWidthRow.row);
        this._controls.grassBladeWidth = bladeWidthRow;

        const bladeHeightMultRow = makeNumberSliderRow({
            label: 'Height Mult',
            value: grass.geometry.blade.height,
            min: 0.2,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.geometry.blade.height = v;
                this._emit();
            }
        });
        bladeSection.appendChild(bladeHeightMultRow.row);
        this._controls.grassHeightMult = bladeHeightMultRow;
        bladeSection.appendChild(makeEl('div', 'options-note', 'Height Mult scales Field Height Min/Max.'));

        const lodSection = this._buildSection('grass', 'LOD');
        lodSection.appendChild(makeEl('div', 'options-note', 'Tip: hover labels for detailed LOD explanations.'));
        lodSection.appendChild(makeToggleRow({
            label: 'Master Enabled',
            tooltip: lodTips.masterEnabled,
            value: grass.lod.enableMaster,
            onChange: (v) => {
                grass.lod.enableMaster = !!v;
                this._emit();
            }
        }).row);

        const forceLodRow = makeSelectRow({
            label: 'Force LOD',
            tooltip: lodTips.force,
            value: grass.lod.force,
            options: [
                { id: 'auto', label: 'Auto' },
                { id: 'master', label: 'Master' },
                { id: 'near', label: 'Near' },
                { id: 'mid', label: 'Mid' },
                { id: 'far', label: 'Far' },
                { id: 'none', label: 'None' }
            ],
            onChange: (id) => {
                grass.lod.force = String(id ?? 'auto');
                this._emit();
            }
        });
        lodSection.appendChild(forceLodRow.row);

        lodSection.appendChild(makeNumberSliderRow({
            label: 'Master Dist (m)',
            tooltip: lodTips.masterDist,
            value: grass.lod.distances.master,
            min: 0,
            max: 50,
            step: 0.25,
            digits: 2,
            onChange: (v) => {
                grass.lod.distances.master = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Near End (m)',
            tooltip: lodTips.nearEnd,
            value: grass.lod.distances.near,
            min: 5,
            max: 500,
            step: 1,
            digits: 0,
            onChange: (v) => {
                grass.lod.distances.near = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Mid End (m)',
            tooltip: lodTips.midEnd,
            value: grass.lod.distances.mid,
            min: 10,
            max: 2000,
            step: 5,
            digits: 0,
            onChange: (v) => {
                grass.lod.distances.mid = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Far End (m)',
            tooltip: lodTips.farEnd,
            value: grass.lod.distances.far,
            min: 20,
            max: 5000,
            step: 10,
            digits: 0,
            onChange: (v) => {
                grass.lod.distances.far = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Cutoff (m)',
            tooltip: lodTips.cutoff,
            value: grass.lod.distances.cutoff,
            min: 20,
            max: 8000,
            step: 10,
            digits: 0,
            onChange: (v) => {
                grass.lod.distances.cutoff = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Transition (m)',
            tooltip: lodTips.transition,
            value: grass.lod.transitionWidthMeters,
            min: 0.1,
            max: 100,
            step: 0.1,
            digits: 1,
            onChange: (v) => {
                grass.lod.transitionWidthMeters = v;
                this._emit();
            }
        }).row);

        lodSection.appendChild(makeNumberSliderRow({
            label: 'Grazing Angle (°)',
            tooltip: lodTips.grazingAngle,
            value: grass.lod.angle.grazingDeg,
            min: 0,
            max: 60,
            step: 0.5,
            digits: 1,
            onChange: (v) => {
                grass.lod.angle.grazingDeg = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Top-down Angle (°)',
            tooltip: lodTips.topDownAngle,
            value: grass.lod.angle.topDownDeg,
            min: 10,
            max: 90,
            step: 0.5,
            digits: 1,
            onChange: (v) => {
                grass.lod.angle.topDownDeg = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Master Max Angle (°)',
            tooltip: lodTips.masterMaxAngle,
            value: grass.lod.angle.masterMaxDeg,
            min: 0,
            max: 60,
            step: 0.5,
            digits: 1,
            onChange: (v) => {
                grass.lod.angle.masterMaxDeg = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Grazing Dist Scale',
            tooltip: lodTips.grazingScale,
            value: grass.lod.angle.grazingDistanceScale,
            min: 0.2,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.lod.angle.grazingDistanceScale = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Top-down Dist Scale',
            tooltip: lodTips.topDownScale,
            value: grass.lod.angle.topDownDistanceScale,
            min: 0.2,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.lod.angle.topDownDistanceScale = v;
                this._emit();
            }
        }).row);

        const lodModes = grass.lod.renderMode && typeof grass.lod.renderMode === 'object'
            ? grass.lod.renderMode
            : (grass.lod.renderMode = { master: 'tuft', near: 'star', mid: 'cross', far: 'cross_sparse' });

        const lodModeSection = this._buildSection('grass', 'LOD Render Mode');
        const modeOptions = [
            { id: 'tuft', label: '3D Tuft (blades)' },
            { id: 'star', label: 'Star' },
            { id: 'cross', label: 'Cross' },
            { id: 'cross_sparse', label: 'Cross (Sparse)' },
            { id: 'none', label: 'None' }
        ];
        const renderMasterRow = makeSelectRow({
            label: 'Master',
            tooltip: lodTips.renderMode,
            value: lodModes.master,
            options: modeOptions,
            onChange: (v) => {
                lodModes.master = String(v ?? 'tuft');
                this._emit();
            }
        });
        lodModeSection.appendChild(renderMasterRow.row);
        this._controls.grassRenderModeMaster = renderMasterRow;

        const renderNearRow = makeSelectRow({
            label: 'Near',
            tooltip: lodTips.renderMode,
            value: lodModes.near,
            options: modeOptions,
            onChange: (v) => {
                lodModes.near = String(v ?? 'star');
                this._emit();
            }
        });
        lodModeSection.appendChild(renderNearRow.row);
        this._controls.grassRenderModeNear = renderNearRow;

        const renderMidRow = makeSelectRow({
            label: 'Mid',
            tooltip: lodTips.renderMode,
            value: lodModes.mid,
            options: modeOptions,
            onChange: (v) => {
                lodModes.mid = String(v ?? 'cross');
                this._emit();
            }
        });
        lodModeSection.appendChild(renderMidRow.row);
        this._controls.grassRenderModeMid = renderMidRow;

        const renderFarRow = makeSelectRow({
            label: 'Far',
            tooltip: lodTips.renderMode,
            value: lodModes.far,
            options: modeOptions,
            onChange: (v) => {
                lodModes.far = String(v ?? 'cross_sparse');
                this._emit();
            }
        });
        lodModeSection.appendChild(renderFarRow.row);
        this._controls.grassRenderModeFar = renderFarRow;

        const lodInspectorSection = this._buildSection('grass', 'LOD Inspectors');
        lodInspectorSection.appendChild(makeButtonRow({
            label: 'Master',
            text: 'Inspect',
            tooltip: lodTips.inspect,
            onClick: () => this._onInspectGrassLod?.('master')
        }).row);
        lodInspectorSection.appendChild(makeButtonRow({
            label: 'Near',
            text: 'Inspect',
            tooltip: lodTips.inspect,
            onClick: () => this._onInspectGrassLod?.('near')
        }).row);
        lodInspectorSection.appendChild(makeButtonRow({
            label: 'Mid',
            text: 'Inspect',
            tooltip: lodTips.inspect,
            onClick: () => this._onInspectGrassLod?.('mid')
        }).row);
        lodInspectorSection.appendChild(makeButtonRow({
            label: 'Far',
            text: 'Inspect',
            tooltip: lodTips.inspect,
            onClick: () => this._onInspectGrassLod?.('far')
        }).row);

        const lodDensitySection = this._buildSection('grass', 'LOD Density');
        const densityMasterRow = makeNumberSliderRow({
            label: 'Master Mul',
            tooltip: lodTips.densityMul,
            value: grass.density.masterMul,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.masterMul = v;
                this._emit();
            }
        });
        lodDensitySection.appendChild(densityMasterRow.row);
        this._controls.grassDensityMasterMul = densityMasterRow;

        const densityNearRow = makeNumberSliderRow({
            label: 'Near Mul',
            tooltip: lodTips.densityMul,
            value: grass.density.nearMul,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.nearMul = v;
                this._emit();
            }
        });
        lodDensitySection.appendChild(densityNearRow.row);
        this._controls.grassDensityNearMul = densityNearRow;

        const densityMidRow = makeNumberSliderRow({
            label: 'Mid Mul',
            tooltip: lodTips.densityMul,
            value: grass.density.midMul,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.midMul = v;
                this._emit();
            }
        });
        lodDensitySection.appendChild(densityMidRow.row);
        this._controls.grassDensityMidMul = densityMidRow;

        const densityFarRow = makeNumberSliderRow({
            label: 'Far Mul',
            tooltip: lodTips.densityMul,
            value: grass.density.farMul,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.farMul = v;
                this._emit();
            }
        });
        lodDensitySection.appendChild(densityFarRow.row);
        this._controls.grassDensityFarMul = densityFarRow;

        const fieldSection = this._buildSection('grass', 'Field');
        fieldSection.appendChild(makeToggleRow({
            label: 'Enabled',
            value: grass.field.enabled,
            onChange: (v) => {
                grass.field.enabled = !!v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeNumberSliderRow({
            label: 'Density (tufts/m²)',
            value: grass.field.density,
            min: 0.0,
            max: 60.0,
            step: 0.1,
            digits: 1,
            onChange: (v) => {
                grass.field.density = v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeColorRow({
            label: 'Base Color',
            value: grass?.field?.color?.base ?? '#2E8F3D',
            onChange: (hex) => {
                grass.field.color.base = hex;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeNumberSliderRow({
            label: 'Hue Var (±°)',
            value: Math.max(0, Number(grass?.field?.color?.variation?.hueShiftDeg?.max) || 0),
            min: 0.0,
            max: 45.0,
            step: 0.25,
            digits: 2,
            onChange: (v) => {
                grass.field.color.variation.hueShiftDeg.min = -v;
                grass.field.color.variation.hueShiftDeg.max = v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeNumberSliderRow({
            label: 'Sat Var (±)',
            value: Math.max(0, (Number(grass?.field?.color?.variation?.saturationMul?.max) || 1) - 1),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.field.color.variation.saturationMul.min = Math.max(0, 1 - v);
                grass.field.color.variation.saturationMul.max = 1 + v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeNumberSliderRow({
            label: 'Bri Var (±)',
            value: Math.max(0, (Number(grass?.field?.color?.variation?.brightnessMul?.max) || 1) - 1),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.field.color.variation.brightnessMul.min = Math.max(0, 1 - v);
                grass.field.color.variation.brightnessMul.max = 1 + v;
                this._emit();
            }
        }).row);
        const fieldHeightMinRow = makeNumberSliderRow({
            label: 'Height Min (m)',
            value: grass.field.height.min,
            min: 0.02,
            max: 1.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.field.height.min = v;
                this._emit();
            }
        });
        fieldSection.appendChild(fieldHeightMinRow.row);
        this._controls.grassFieldHeightMin = fieldHeightMinRow;

        const fieldHeightMaxRow = makeNumberSliderRow({
            label: 'Height Max (m)',
            value: grass.field.height.max,
            min: 0.02,
            max: 2.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.field.height.max = v;
                this._emit();
            }
        });
        fieldSection.appendChild(fieldHeightMaxRow.row);
        this._controls.grassFieldHeightMax = fieldHeightMaxRow;
        fieldSection.appendChild(makeSelectRow({
            label: 'Force LOD',
            tooltip: lodTips.fieldForce,
            value: grass?.field?.lod?.force ?? 'auto',
            options: [
                { id: 'auto', label: 'Auto' },
                { id: 'master', label: 'Master' },
                { id: 'near', label: 'Near' },
                { id: 'mid', label: 'Mid' },
                { id: 'far', label: 'Far' },
                { id: 'none', label: 'None' }
            ],
            onChange: (v) => {
                grass.field.lod.force = String(v ?? 'auto');
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeEl('div', 'options-note', 'Allow LODs:'));
        const fieldAllow = grass?.field?.lod?.allow ?? {};
        fieldSection.appendChild(makeToggleRow({
            label: 'Allow Master',
            tooltip: lodTips.fieldAllow,
            value: !!fieldAllow.master,
            onChange: (v) => {
                grass.field.lod.allow.master = !!v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeToggleRow({
            label: 'Allow Near',
            tooltip: lodTips.fieldAllow,
            value: !!fieldAllow.near,
            onChange: (v) => {
                grass.field.lod.allow.near = !!v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeToggleRow({
            label: 'Allow Mid',
            tooltip: lodTips.fieldAllow,
            value: !!fieldAllow.mid,
            onChange: (v) => {
                grass.field.lod.allow.mid = !!v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeToggleRow({
            label: 'Allow Far',
            tooltip: lodTips.fieldAllow,
            value: !!fieldAllow.far,
            onChange: (v) => {
                grass.field.lod.allow.far = !!v;
                this._emit();
            }
        }).row);

        const exclusionSection = this._buildSection('grass', 'Exclusion');
        exclusionSection.appendChild(makeToggleRow({
            label: 'Road / Sidewalk',
            value: grass.exclusion.enabled,
            onChange: (v) => {
                grass.exclusion.enabled = !!v;
                this._emit();
            }
        }).row);
        exclusionSection.appendChild(makeNumberSliderRow({
            label: 'Margin (m)',
            value: grass.exclusion.marginMeters,
            min: 0.0,
            max: 10.0,
            step: 0.05,
            digits: 2,
            onChange: (v) => {
                grass.exclusion.marginMeters = v;
                this._emit();
            }
        }).row);

        const debugSection = this._buildSection('grass', 'Debug');
        debugSection.appendChild(makeToggleRow({
            label: 'LOD Rings',
            tooltip: lodTips.debugBaseRings,
            value: grass.debug.showLodRings,
            onChange: (v) => {
                grass.debug.showLodRings = !!v;
                this._emit();
            }
        }).row);
        debugSection.appendChild(makeToggleRow({
            label: 'Angle-scaled LOD Rings',
            tooltip: lodTips.debugAngleScaledRings,
            value: !!grass.debug.showLodAngleScaledRings,
            onChange: (v) => {
                grass.debug.showLodAngleScaledRings = !!v;
                this._emit();
            }
        }).row);

        this._controls.grassLodDebugInfo = makeEl('div', 'options-note', 'View angle: (n/a) · AngleScale: (n/a)');
        debugSection.appendChild(this._controls.grassLodDebugInfo);

        const statsSection = this._buildSection('grass', 'Stats');
        this._controls.grassStatsInstances = makeEl('div', 'options-note', 'Instances: (disabled)');
        this._controls.grassStatsTriangles = makeEl('div', 'options-note', 'Triangles: (disabled)');
        this._controls.grassStatsDrawCalls = makeEl('div', 'options-note', 'Draw calls: (disabled)');
        statsSection.appendChild(this._controls.grassStatsInstances);
        statsSection.appendChild(this._controls.grassStatsTriangles);
        statsSection.appendChild(this._controls.grassStatsDrawCalls);
    }

    _syncGroundMaterialPicker() {
        const picker = this._controls?.groundMaterialPicker ?? null;
        if (!picker) return;
        const id = String(this._state?.terrain?.groundMaterialId ?? '');
        const options = getPbrMaterialOptionsForGround();
        const found = options.find((opt) => opt?.id === id) ?? options[0] ?? null;
        const label = found?.label ?? id ?? '';
        picker.textEl.textContent = label;
        setOptionsThumbToTexture(picker.thumb, found?.previewUrl ?? '', label);
    }

    _openGroundMaterialPicker() {
        const picker = this._controls?.groundMaterialPicker ?? null;
        if (!picker || picker.btn?.disabled) return;

        const options = getPbrMaterialOptionsForGround().map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.previewUrl ?? null
        }));

        this._pickerPopup?.open?.({
            title: 'Ground material',
            sections: [{ label: 'Ground', options }],
            selectedId: String(this._state?.terrain?.groundMaterialId ?? ''),
            onSelect: (opt) => {
                this._state.terrain.groundMaterialId = String(opt?.id ?? '');
                this._syncGroundMaterialPicker();
                this._emit();
            }
        });
    }
}
