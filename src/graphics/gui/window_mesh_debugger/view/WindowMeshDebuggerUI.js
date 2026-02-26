// src/graphics/gui/window_mesh_debugger/view/WindowMeshDebuggerUI.js
// Docked Options-style panel for the Window Mesh Debugger.
// @ts-check

import {
    getDefaultWindowMeshSettings,
    sanitizeWindowMeshSettings,
    getDefaultWindowDecorationState,
    sanitizeWindowDecorationState,
    getWindowDecorationTypeOptions,
    getWindowDecorationTypeMetadata,
    WINDOW_DECORATION_PART,
    WINDOW_DECORATION_STYLE,
    WINDOW_DECORATION_WIDTH_MODE,
    WINDOW_DECORATION_MATERIAL_MODE,
    WINDOW_DECORATION_DEPTH_OPTIONS_METERS,
    WINDOW_SHADE_COVERAGE,
    WINDOW_SHADE_DIRECTION,
    detectWindowGlassPresetId,
    getWindowGlassPresetById,
    getWindowGlassPresetOptions,
    getParallaxInteriorPresetOptions,
    WINDOW_FABRICATION_ASSET_TYPE,
    normalizeWindowFabricationAssetType,
    normalizeWindowFabricationCatalogName,
    getWindowFabricationAssetTypeOptions,
    getWindowFabricationCatalogEntries
} from '../../../../app/buildings/window_mesh/index.js';
import { DEFAULT_IBL_ID, getIblOptions } from '../../../content3d/catalogs/IBLCatalog.js';
import { getPbrMaterialClassSectionsForBuildings, getPbrMaterialOptionsForBuildings } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { getWindowInteriorAtlasOptions } from '../../../content3d/catalogs/WindowInteriorAtlasCatalog.js';
import { PickerPopup } from '../../shared/PickerPopup.js';

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

const GARAGE_FACADE_STATE = Object.freeze({
    OPEN: 'open',
    CLOSED: 'closed'
});
const GARAGE_FACADE_ROTATION_DEGREES = Object.freeze({
    DEG_0: 0,
    DEG_90: 90
});
const GARAGE_FACADE_ROTATION_OPTIONS = Object.freeze([
    { id: String(GARAGE_FACADE_ROTATION_DEGREES.DEG_0), label: '0 deg' },
    { id: String(GARAGE_FACADE_ROTATION_DEGREES.DEG_90), label: '90 deg' }
]);

const WINDOW_GLASS_PRESET_CUSTOM_ID = '__custom__';

function getAssetCatalogFallbackName(assetType) {
    const mode = normalizeWindowFabricationAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
    if (mode === WINDOW_FABRICATION_ASSET_TYPE.DOOR) return 'Door Entry';
    if (mode === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) return 'Garage Entry';
    return 'Window Entry';
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

function toSafeFileToken(value, fallback = 'config') {
    const raw = typeof value === 'string' ? value.trim() : '';
    const token = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return token || fallback;
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
    input.className = 'options-text-input';
    input.value = String(value ?? '');
    input.placeholder = String(placeholder ?? '');
    input.addEventListener('change', () => onChange?.(String(input.value)));
    input.addEventListener('blur', () => onChange?.(String(input.value)));

    right.appendChild(input);
    row.appendChild(left);
    row.appendChild(right);
    return { row, input };
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

function makeMaterialPickerRow({ label, tooltip = '', onPick }) {
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

function normalizeCatalogEntryNameInput(value, fallback = 'Catalog Entry') {
    return normalizeWindowFabricationCatalogName(value, fallback);
}

function hashString32(value) {
    const raw = String(value ?? '');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < raw.length; i++) {
        h ^= raw.charCodeAt(i) & 0xff;
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function hslFromSeed(seed, satPct = 32, lightPct = 56) {
    const hue = hashString32(seed) % 360;
    const sat = clamp(Number(satPct) || 32, 0, 100).toFixed(1);
    const light = clamp(Number(lightPct) || 56, 0, 100).toFixed(1);
    return `hsl(${hue} ${sat}% ${light}%)`;
}

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildCatalogEntryThumbnailDataUrl(entry) {
    const item = entry && typeof entry === 'object' ? entry : {};
    const settings = item.settings && typeof item.settings === 'object' ? item.settings : {};
    const frame = settings.frame && typeof settings.frame === 'object' ? settings.frame : {};
    const muntins = settings.muntins && typeof settings.muntins === 'object' ? settings.muntins : {};
    const wall = item.wall && typeof item.wall === 'object' ? item.wall : {};
    const thumb = item.thumbnail && typeof item.thumbnail === 'object' ? item.thumbnail : {};
    const mode = normalizeWindowFabricationAssetType(item.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
    const isDoorMode = mode === WINDOW_FABRICATION_ASSET_TYPE.DOOR;
    const isGarageMode = mode === WINDOW_FABRICATION_ASSET_TYPE.GARAGE;
    const hasArch = !!settings?.arch?.enabled && !isDoorMode && !isGarageMode;
    const doorBottomMode = typeof frame?.doorBottomFrame?.mode === 'string' ? frame.doorBottomFrame.mode.trim().toLowerCase() : '';
    const hasDoorBottomFrame = !!frame?.doorBottomFrame?.enabled && doorBottomMode === 'match';
    const frameOpenBottom = isGarageMode
        ? true
        : ((isDoorMode || !!frame.openBottom) && !hasDoorBottomFrame);
    const gridCols = Math.max(1, Math.round(Number(muntins.columns) || 1));
    const gridRows = Math.max(1, Math.round(Number(muntins.rows) || 1));
    const hasGrid = !!muntins.enabled && (gridCols > 1 || gridRows > 1);

    const wallMaterialId = String(wall.materialId ?? thumb.wallMaterialId ?? '');
    const bgA = hslFromSeed(`${wallMaterialId}|bgA`, 38, 56);
    const bgB = hslFromSeed(`${wallMaterialId}|bgB`, 34, 47);
    const frameColor = hslFromSeed(`${item.id}|frame`, 22, 26);
    const glassColor = hslFromSeed(`${item.id}|glass`, 45, 80);
    const muntinColor = hslFromSeed(`${item.id}|muntins`, 18, 20);
    const fg = hslFromSeed(`${item.id}|label`, 10, 97);

    const fallbackTitle = mode === WINDOW_FABRICATION_ASSET_TYPE.DOOR
        ? 'Door'
        : (mode === WINDOW_FABRICATION_ASSET_TYPE.GARAGE ? 'Garage' : 'Window');
    const title = normalizeCatalogEntryNameInput(item.name ?? item.label ?? item.id ?? '', fallbackTitle);
    const lines = [];
    if (hasGrid) {
        for (let c = 1; c < gridCols; c++) {
            const x = 28 + (88 * c / gridCols);
            lines.push(`<line x1=\"${x}\" y1=\"34\" x2=\"${x}\" y2=\"122\" stroke=\"${muntinColor}\" stroke-width=\"2.2\"/>`);
        }
        for (let r = 1; r < gridRows; r++) {
            const y = 34 + (88 * r / gridRows);
            lines.push(`<line x1=\"28\" y1=\"${y}\" x2=\"116\" y2=\"${y}\" stroke=\"${muntinColor}\" stroke-width=\"2.2\"/>`);
        }
    }

    const outlineRect = frameOpenBottom
        ? `<path d=\"M22 124 L22 36 Q22 28 30 28 L114 28 Q122 28 122 36 L122 124\" fill=\"none\" stroke=\"${frameColor}\" stroke-width=\"6\"/>`
        : `<rect x=\"22\" y=\"28\" width=\"100\" height=\"100\" rx=\"${isDoorMode || isGarageMode ? 10 : 7}\" fill=\"none\" stroke=\"${frameColor}\" stroke-width=\"6\"/>`;
    const fillRect = `<rect x=\"28\" y=\"34\" width=\"88\" height=\"88\" rx=\"${isDoorMode || isGarageMode ? 8 : 5}\" fill=\"${glassColor}\"/>`;
    const archShape = hasArch
        ? '<path d=\"M28 54 Q72 6 116 54\" fill=\"none\" stroke-width=\"5.5\" />'
        : '';

    const svg = `\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"144\" height=\"144\" viewBox=\"0 0 144 144\" aria-label=\"${escapeXml(title)}\">\n<defs>\n<linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0%\" stop-color=\"${bgA}\"/><stop offset=\"100%\" stop-color=\"${bgB}\"/></linearGradient>\n</defs>\n<rect width=\"144\" height=\"144\" fill=\"url(#bg)\"/>\n<rect x=\"10\" y=\"10\" width=\"124\" height=\"124\" rx=\"12\" fill=\"rgba(0,0,0,0.12)\"/>\n${fillRect}\n${outlineRect}\n<g stroke=\"${frameColor}\">${archShape}</g>\n<g>${lines.join('')}</g>\n<text x=\"12\" y=\"139\" font-size=\"10\" fill=\"${fg}\" font-family=\"Arial, sans-serif\">${escapeXml(title.slice(0, 26))}</text>\n</svg>\n`.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export class WindowMeshDebuggerUI {
    constructor({
        title = 'Window Mesh Debugger',
        subtitle = 'Arrow/WASD move · Shift fast · RMB orbit · MMB pan · Wheel zoom · F frame · R reset · Esc back',
        embedded = false,
        initialSettings,
        initialSeed = 'window-debug',
        initialWallMaterialId = null,
        onChange,
        onClose = null,
        captureThumbnail = null
    } = {}) {
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onClose = typeof onClose === 'function' ? onClose : null;
        this._captureThumbnail = typeof captureThumbnail === 'function' ? captureThumbnail : null;
        this._isSetting = false;

        const defaults = getDefaultWindowMeshSettings();
        const initial = sanitizeWindowMeshSettings({ ...defaults, ...(initialSettings ?? {}) });
        const initialLinkMuntinThickness = Math.abs(Number(initial.muntins.verticalWidth) - Number(initial.muntins.horizontalWidth)) < 1e-6;
        const initialLinkFrameThickness = Math.abs(Number(initial.frame.verticalWidth ?? initial.frame.width) - Number(initial.frame.horizontalWidth ?? initial.frame.width)) < 1e-6;
        const windowCatalogEntries = getWindowFabricationCatalogEntries({ assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW });
        const doorCatalogEntries = getWindowFabricationCatalogEntries({ assetType: WINDOW_FABRICATION_ASSET_TYPE.DOOR });
        const garageCatalogEntries = getWindowFabricationCatalogEntries({ assetType: WINDOW_FABRICATION_ASSET_TYPE.GARAGE });
        const defaultWindowCatalogId = String(windowCatalogEntries[0]?.id ?? '');
        const defaultDoorCatalogId = String(doorCatalogEntries[0]?.id ?? '');
        const defaultGarageCatalogId = String(garageCatalogEntries[0]?.id ?? '');
        const defaultWindowCatalogName = normalizeCatalogEntryNameInput(
            windowCatalogEntries[0]?.name ?? windowCatalogEntries[0]?.label ?? getAssetCatalogFallbackName(WINDOW_FABRICATION_ASSET_TYPE.WINDOW),
            getAssetCatalogFallbackName(WINDOW_FABRICATION_ASSET_TYPE.WINDOW)
        );
        const defaultDoorCatalogName = normalizeCatalogEntryNameInput(
            doorCatalogEntries[0]?.name ?? doorCatalogEntries[0]?.label ?? getAssetCatalogFallbackName(WINDOW_FABRICATION_ASSET_TYPE.DOOR),
            getAssetCatalogFallbackName(WINDOW_FABRICATION_ASSET_TYPE.DOOR)
        );
        const defaultGarageCatalogName = normalizeCatalogEntryNameInput(
            garageCatalogEntries[0]?.name ?? garageCatalogEntries[0]?.label ?? getAssetCatalogFallbackName(WINDOW_FABRICATION_ASSET_TYPE.GARAGE),
            getAssetCatalogFallbackName(WINDOW_FABRICATION_ASSET_TYPE.GARAGE)
        );

        const wallOptions = getPbrMaterialOptionsForBuildings();
        const garageMetalOptions = wallOptions.filter((opt) => opt?.classId === 'metal');
        const defaultWall = wallOptions[0]?.id ?? '';
        const defaultGarageClosedMaterialId = String(garageMetalOptions[0]?.id ?? defaultWall);
        const defaultDecoration = getDefaultWindowDecorationState({ wallMaterialId: defaultWall });

        this._catalogByAssetType = {
            [WINDOW_FABRICATION_ASSET_TYPE.WINDOW]: windowCatalogEntries,
            [WINDOW_FABRICATION_ASSET_TYPE.DOOR]: doorCatalogEntries,
            [WINDOW_FABRICATION_ASSET_TYPE.GARAGE]: garageCatalogEntries
        };
        this._garageMetalOptions = garageMetalOptions;

        this._state = {
            assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
            assetCatalogId: defaultWindowCatalogId,
            assetCatalogName: defaultWindowCatalogName,
            catalogByAssetType: {
                [WINDOW_FABRICATION_ASSET_TYPE.WINDOW]: defaultWindowCatalogId,
                [WINDOW_FABRICATION_ASSET_TYPE.DOOR]: defaultDoorCatalogId,
                [WINDOW_FABRICATION_ASSET_TYPE.GARAGE]: defaultGarageCatalogId
            },
            catalogNameByAssetType: {
                [WINDOW_FABRICATION_ASSET_TYPE.WINDOW]: defaultWindowCatalogName,
                [WINDOW_FABRICATION_ASSET_TYPE.DOOR]: defaultDoorCatalogName,
                [WINDOW_FABRICATION_ASSET_TYPE.GARAGE]: defaultGarageCatalogName
            },
            seed: String(initialSeed ?? 'window-debug'),
            wallMaterialId: String(initialWallMaterialId ?? defaultWall),
            wallRoughness: 0.85,
            wallNormalIntensity: 1.0,
            wallCutWidthLerp: 0.0,
            wallCutHeightLerp: 0.0,
            floorDistanceMeters: 0.0,
            ibl: {
                enabled: true,
                envMapIntensity: 0.25,
                iblId: DEFAULT_IBL_ID,
                setBackground: true
            },
            renderMode: 'solid',
            layers: { frame: true, muntins: true, glass: true, shade: true, interior: true },
            decoration: deepClone(defaultDecoration),
            garageFacade: {
                state: GARAGE_FACADE_STATE.CLOSED,
                closedMaterialId: defaultGarageClosedMaterialId,
                rotationDegrees: GARAGE_FACADE_ROTATION_DEGREES.DEG_0
            },
            debug: {
                bevelExaggerate: false,
                linkFrameThickness: initialLinkFrameThickness,
                linkMuntinThickness: initialLinkMuntinThickness
            },
            settings: initial
        };
        this._defaultDecoration = deepClone(this._state.decoration);
        this._catalogPicker = new PickerPopup();
        this._catalogPreviewCache = new Map();

        const rootClass = embedded ? 'options-layer is-embedded' : 'ui-layer options-layer';
        this.root = makeEl('div', rootClass);
        this.root.id = 'ui-window-mesh-debugger';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const headerTop = makeEl('div', 'options-header-top');
        headerTop.appendChild(makeEl('div', 'options-title', String(title ?? 'Window Mesh Debugger')));
        if (this._onClose) {
            const closeBtn = makeEl('button', 'options-close-btn', 'Close');
            closeBtn.type = 'button';
            closeBtn.addEventListener('click', () => this._onClose?.());
            headerTop.appendChild(closeBtn);
        }
        header.appendChild(headerTop);
        if (typeof subtitle === 'string' && subtitle.trim()) {
            header.appendChild(makeEl('div', 'options-subtitle', subtitle.trim()));
        }
        this.panel.appendChild(header);

        this.globalControls = makeEl('div', 'window-mesh-global-controls');
        this.panel.appendChild(this.globalControls);

        this.tabs = makeEl('div', 'options-tabs');
        this.panel.appendChild(this.tabs);

        this.body = makeEl('div', 'options-body');
        this.panel.appendChild(this.body);
        this.root.appendChild(this.panel);

        this._controls = {};
        this._tab = 'scene';
        this._tabButtons = {};
        this._tabBodies = {};
        this._interiorOverlayEnabled = false;
        this._interiorOverlayData = null;
        this._interiorOverlayPre = null;

        this._rebuildControlsFromState({ keepActiveTab: false, wallOptions });

        this._onKeyDown = (e) => {
            if (!e) return;
            if (e.code !== 'Escape' && e.key !== 'Escape') return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
        };
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    mount({ parent = null } = {}) {
        const host = parent?.appendChild ? parent : document.body;
        host.appendChild(this.root);
    }

    unmount() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._catalogPicker?.dispose?.();
        this._catalogPicker = null;
        this._catalogPreviewCache?.clear?.();
        this._catalogPreviewCache = null;
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

    _buildGlobalAssetModeControl() {
        const modeOptions = getWindowFabricationAssetTypeOptions();
        const modeRow = makeChoiceRow({
            label: 'Build',
            value: normalizeWindowFabricationAssetType(this._state.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW),
            options: modeOptions,
            onChange: (id) => {
                const nextMode = normalizeWindowFabricationAssetType(id, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
                const targetCatalogId = this._state.catalogByAssetType?.[nextMode] ?? '';
                this._applyCatalogPreset({
                    assetType: nextMode,
                    catalogId: targetCatalogId,
                    emit: true,
                    applyEntry: false
                });
            }
        });
        this.globalControls.appendChild(modeRow.row);
        this._controls.assetType = modeRow;

        const modeNote = makeEl('div', 'options-note', '');
        this.globalControls.appendChild(modeNote);
        this._controls.assetModeNote = modeNote;
    }

    _buildTabs() {
        const tabDefs = [
            { id: 'scene', label: 'Scene' },
            { id: 'size', label: 'Size' },
            { id: 'frame', label: 'Frame' },
            { id: 'facade', label: 'Facade' },
            { id: 'glass', label: 'Glass' },
            { id: 'shade', label: 'Shade' },
            { id: 'decoration', label: 'Decoration' },
            { id: 'interior', label: 'Interior' }
        ];

        for (const def of tabDefs) {
            const id = String(def.id);
            const btn = makeEl('button', 'options-tab', String(def.label));
            btn.type = 'button';
            btn.addEventListener('click', () => this._setActiveTab(id));
            this.tabs.appendChild(btn);
            this._tabButtons[id] = btn;

            const pane = makeEl('div', 'window-mesh-tab-pane');
            this.body.appendChild(pane);
            this._tabBodies[id] = pane;
        }
    }

    _rebuildControlsFromState({ keepActiveTab = true, wallOptions = null } = {}) {
        const desiredTab = keepActiveTab ? this._tab : 'scene';
        const resolvedWallOptions = Array.isArray(wallOptions) ? wallOptions : getPbrMaterialOptionsForBuildings();

        this._controls = {};
        this._tabButtons = {};
        this._tabBodies = {};
        this._interiorOverlayPre = null;

        this.globalControls?.replaceChildren?.();
        this.tabs?.replaceChildren?.();
        this.body?.replaceChildren?.();

        this._buildGlobalAssetModeControl();
        this._buildAssetSection({ parent: this.globalControls, showTitle: false });
        this._buildTabs();

        this._buildSceneSection({ wallOptions: resolvedWallOptions, parent: this._tabBodies.scene, showTitle: true });
        this._buildLayersSection({ parent: this._tabBodies.scene, showTitle: true });
        this._buildSizeSection({ parent: this._tabBodies.size, showTitle: false });
        this._buildFrameSection({ parent: this._tabBodies.frame, showTitle: true });
        this._buildFacadeSection({ parent: this._tabBodies.facade, showTitle: false });
        this._buildArchSection({ parent: this._tabBodies.frame, showTitle: true });
        this._buildMuntinsSection({ parent: this._tabBodies.frame, showTitle: true });
        this._buildGlassSection({ parent: this._tabBodies.glass, showTitle: false });
        this._buildShadeSection({ parent: this._tabBodies.shade, showTitle: false });
        this._buildDecorationSection({ wallOptions: resolvedWallOptions, parent: this._tabBodies.decoration, showTitle: false });
        this._buildInteriorSection({ parent: this._tabBodies.interior, showTitle: false });
        this._setActiveTab(desiredTab);
        this._syncAssetModeUi();
        this._renderInteriorOverlay();
    }

    _setActiveTab(tabId) {
        const next = Object.prototype.hasOwnProperty.call(this._tabBodies, tabId) ? tabId : 'scene';
        this._tab = next;
        for (const [id, btn] of Object.entries(this._tabButtons)) btn.classList.toggle('is-active', id === next);
        for (const [id, pane] of Object.entries(this._tabBodies)) pane.classList.toggle('is-active', id === next);
    }

    _buildSection(title, { parent = this.body, showTitle = true } = {}) {
        const host = parent && parent.appendChild ? parent : this.body;
        const section = makeEl('div', 'options-section');
        if (showTitle && title) section.appendChild(makeEl('div', 'options-section-title', String(title)));
        host.appendChild(section);
        return section;
    }

    _getGarageMetalOptions() {
        const list = Array.isArray(this._garageMetalOptions) ? this._garageMetalOptions : [];
        if (list.length) return list;
        return getPbrMaterialOptionsForBuildings();
    }

    _resolveGarageClosedMaterialId(candidateId = null) {
        const options = this._getGarageMetalOptions();
        if (!options.length) return '';
        const candidate = typeof candidateId === 'string' ? candidateId.trim() : '';
        if (candidate && options.some((opt) => opt?.id === candidate)) return candidate;
        return String(options[0]?.id ?? '');
    }

    _resolveGarageFacadeState(candidate = null) {
        const raw = typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
        if (raw === GARAGE_FACADE_STATE.OPEN) return GARAGE_FACADE_STATE.OPEN;
        return GARAGE_FACADE_STATE.CLOSED;
    }

    _resolveGarageFacadeRotationDegrees(candidate = null) {
        const num = Number(candidate);
        if (Number.isFinite(num) && Math.abs(num - GARAGE_FACADE_ROTATION_DEGREES.DEG_90) < 0.5) {
            return GARAGE_FACADE_ROTATION_DEGREES.DEG_90;
        }
        return GARAGE_FACADE_ROTATION_DEGREES.DEG_0;
    }

    _getCatalogEntries(assetType) {
        const mode = normalizeWindowFabricationAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const list = this._catalogByAssetType?.[mode];
        return Array.isArray(list) ? list : [];
    }

    _resolveCatalogId(assetType, candidateId = null) {
        const mode = normalizeWindowFabricationAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const entries = this._getCatalogEntries(mode);
        if (!entries.length) return '';

        const candidate = typeof candidateId === 'string' ? candidateId.trim() : '';
        if (candidate && entries.some((entry) => entry.id === candidate)) return candidate;
        return String(entries[0]?.id ?? '');
    }

    _getCatalogEntryById(assetType, catalogId = null) {
        const mode = normalizeWindowFabricationAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const resolved = this._resolveCatalogId(mode, catalogId);
        if (!resolved) return null;
        return this._getCatalogEntries(mode).find((entry) => entry?.id === resolved) ?? null;
    }

    _resolveCatalogName(assetType, candidateName = null, fallbackCatalogId = null) {
        const mode = normalizeWindowFabricationAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const trimmed = typeof candidateName === 'string' ? candidateName.trim() : '';
        const fallbackName = getAssetCatalogFallbackName(mode);
        if (trimmed) return normalizeCatalogEntryNameInput(trimmed, fallbackName);
        const fallbackEntry = this._getCatalogEntryById(mode, fallbackCatalogId);
        return normalizeCatalogEntryNameInput(
            fallbackEntry?.name ?? fallbackEntry?.label ?? fallbackName,
            fallbackName
        );
    }

    async _getCatalogPickerPreviewUrl(entry) {
        const item = entry && typeof entry === 'object' ? entry : null;
        if (!item) return '';

        const thumb = item.thumbnail && typeof item.thumbnail === 'object' ? item.thumbnail : null;
        const explicit = typeof thumb?.dataUrl === 'string' ? thumb.dataUrl.trim() : '';
        if (explicit.startsWith('data:image/')) return explicit;

        const assetType = normalizeWindowFabricationAssetType(item.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const wallHintId = String(this._state.wallMaterialId ?? item?.wall?.materialId ?? thumb?.wallMaterialId ?? '');
        const entryGarageFacade = item?.garageFacade && typeof item.garageFacade === 'object' ? item.garageFacade : {};
        const garageFacadeForPreview = {
            state: this._resolveGarageFacadeState(entryGarageFacade.state),
            closedMaterialId: this._resolveGarageClosedMaterialId(entryGarageFacade.closedMaterialId),
            rotationDegrees: this._resolveGarageFacadeRotationDegrees(entryGarageFacade.rotationDegrees)
        };
        const wallR = Number(this._state.wallRoughness) || 0;
        const wallN = Number(this._state.wallNormalIntensity) || 0;
        const cutX = Number(this._state.wallCutWidthLerp) || 0;
        const cutY = Number(this._state.wallCutHeightLerp) || 0;
        const floorDistanceMeters = clamp(this._state.floorDistanceMeters, 0.0, 32.0, 0.0);
        const garagePreviewToken = assetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE
            ? `|gs:${garageFacadeForPreview.state}|gm:${garageFacadeForPreview.closedMaterialId}|gr:${garageFacadeForPreview.rotationDegrees}`
            : '';
        const cacheKey = `${String(item.id ?? '')}|${wallHintId}|wr:${wallR.toFixed(3)}|wn:${wallN.toFixed(3)}|cx:${cutX.toFixed(3)}|cy:${cutY.toFixed(3)}|fd:${floorDistanceMeters.toFixed(3)}${garagePreviewToken}`;
        const cached = this._catalogPreviewCache?.get?.(cacheKey);
        if (typeof cached === 'string' && cached.startsWith('data:image/')) return cached;

        let generated = '';
        if (this._captureThumbnail && item.settings && typeof item.settings === 'object') {
            try {
                const captured = await Promise.resolve(this._captureThumbnail({
                    reason: 'catalog_picker_entry_thumbnail',
                    maxSize: 256,
                    assetType,
                    seed: typeof item.seed === 'string' ? item.seed : this._state.seed,
                    settings: deepClone(item.settings),
                    garageFacade: deepClone(garageFacadeForPreview),
                    wall: {
                        materialId: wallHintId,
                        roughness: Number(this._state.wallRoughness),
                        normalIntensity: Number(this._state.wallNormalIntensity),
                        cutWidthLerp: Number(this._state.wallCutWidthLerp),
                        cutHeightLerp: Number(this._state.wallCutHeightLerp),
                        floorDistanceMeters
                    }
                }));
                if (typeof captured === 'string' && captured.startsWith('data:image/')) generated = captured;
            } catch (err) {
                console.warn('[WindowMeshDebuggerUI] Catalog thumbnail capture failed.', err);
            }
        }

        if (!generated) generated = buildCatalogEntryThumbnailDataUrl(item);
        this._catalogPreviewCache?.set?.(cacheKey, generated);
        return generated;
    }

    _buildAssetSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Asset', { parent, showTitle });
        const currentMode = normalizeWindowFabricationAssetType(this._state.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);

        const initialCatalogId = this._resolveCatalogId(currentMode, this._state.catalogByAssetType?.[currentMode]);
        const initialCatalogName = this._resolveCatalogName(
            currentMode,
            this._state.catalogNameByAssetType?.[currentMode] ?? this._state.assetCatalogName,
            initialCatalogId
        );
        this._state.catalogByAssetType[currentMode] = initialCatalogId;
        this._state.assetCatalogId = initialCatalogId;
        this._state.catalogNameByAssetType[currentMode] = initialCatalogName;
        this._state.assetCatalogName = initialCatalogName;

        const nameRow = makeTextRow({
            label: 'Catalog Name',
            value: initialCatalogName,
            placeholder: getAssetCatalogFallbackName(currentMode),
            onChange: (value) => {
                const mode = normalizeWindowFabricationAssetType(this._state.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
                const fallback = getAssetCatalogFallbackName(mode);
                const resolved = normalizeCatalogEntryNameInput(value, fallback);
                this._state.catalogNameByAssetType[mode] = resolved;
                this._state.assetCatalogName = resolved;
                if (nameRow?.input) nameRow.input.value = resolved;
                this._emit();
            }
        });
        section.appendChild(nameRow.row);
        this._controls.assetCatalogName = nameRow;
        this._controls.assetCatalogNameLabel = nameRow.row.querySelector('.options-row-label');
        if (nameRow?.input) nameRow.input.classList.add('options-input-grow');

        const actionsRow = makeEl('div', 'options-row options-row-wide');
        const actionsLabel = makeEl('div', 'options-row-label');
        actionsLabel.setAttribute('aria-hidden', 'true');
        const actionsControl = makeEl('div', 'options-row-control options-row-control-wide');
        const actionsButtons = makeEl('div', 'options-action-buttons');

        const loadBtn = makeEl('button', 'options-btn', 'Load');
        loadBtn.type = 'button';
        loadBtn.addEventListener('click', () => { void this._openCatalogLoadPicker(); });

        const exportBtn = makeEl('button', 'options-btn', 'Export');
        exportBtn.type = 'button';
        exportBtn.addEventListener('click', () => { void this._exportCurrentConfig(); });

        actionsButtons.appendChild(loadBtn);
        actionsButtons.appendChild(exportBtn);
        actionsControl.appendChild(actionsButtons);
        actionsRow.appendChild(actionsLabel);
        actionsRow.appendChild(actionsControl);
        section.appendChild(actionsRow);

        this._controls.assetLoadBtn = loadBtn;
        this._controls.assetExportBtn = exportBtn;

    }

    async _openCatalogLoadPicker() {
        const mode = normalizeWindowFabricationAssetType(this._state.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const assetTypeOptions = Array.isArray(getWindowFabricationAssetTypeOptions())
            ? getWindowFabricationAssetTypeOptions()
            : [];
        const modeLabels = new Map();
        const orderedModes = [];
        for (const opt of assetTypeOptions) {
            const optMode = normalizeWindowFabricationAssetType(opt?.id, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
            if (modeLabels.has(optMode)) continue;
            const label = typeof opt?.label === 'string' && opt.label.trim()
                ? opt.label.trim()
                : getAssetCatalogFallbackName(optMode).replace(/\s+Entry$/i, '');
            modeLabels.set(optMode, label);
            orderedModes.push(optMode);
        }
        if (!orderedModes.includes(mode)) orderedModes.unshift(mode);
        const prioritizedModes = [mode, ...orderedModes.filter((entryMode) => entryMode !== mode)];
        const pickerOptionIdPrefix = 'asset';
        const makePickerOptionId = (entryMode, entryId) => {
            const resolvedMode = normalizeWindowFabricationAssetType(entryMode, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
            const resolvedId = String(entryId ?? '').trim();
            if (!resolvedId) return '';
            return `${pickerOptionIdPrefix}:${resolvedMode}:${resolvedId}`;
        };
        const parsePickerOptionId = (value) => {
            const raw = typeof value === 'string' ? value.trim() : '';
            const prefix = `${pickerOptionIdPrefix}:`;
            if (!raw.startsWith(prefix)) return null;
            const remainder = raw.slice(prefix.length);
            const splitIdx = remainder.indexOf(':');
            if (splitIdx <= 0) return null;
            const parsedMode = normalizeWindowFabricationAssetType(remainder.slice(0, splitIdx), WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
            const parsedCatalogId = remainder.slice(splitIdx + 1).trim();
            if (!parsedCatalogId) return null;
            return { assetType: parsedMode, catalogId: parsedCatalogId };
        };
        const hasAnyEntries = prioritizedModes.some((entryMode) => this._getCatalogEntries(entryMode).length > 0);
        if (!hasAnyEntries) return;

        if (this._controls.assetLoadBtn) this._controls.assetLoadBtn.disabled = true;

        const selectedCatalogId = this._resolveCatalogId(mode, this._state.assetCatalogId);
        const selectedId = makePickerOptionId(mode, selectedCatalogId);
        try {
            const sections = [];
            for (const sectionMode of prioritizedModes) {
                const entries = this._getCatalogEntries(sectionMode);
                const options = (await Promise.all(entries.map(async (entry) => {
                    const entryId = String(entry?.id ?? '').trim();
                    return {
                        id: makePickerOptionId(sectionMode, entryId),
                        label: normalizeCatalogEntryNameInput(entry?.name ?? entry?.label ?? entryId, getAssetCatalogFallbackName(sectionMode)),
                        kind: 'texture',
                        previewUrl: await this._getCatalogPickerPreviewUrl(entry)
                    };
                }))).filter((opt) => !!opt.id);
                if (!options.length) continue;
                sections.push({
                    label: modeLabels.get(sectionMode) ?? getAssetCatalogFallbackName(sectionMode).replace(/\s+Entry$/i, ''),
                    options
                });
            }
            if (!sections.length) return;

            this._catalogPicker?.open?.({
                title: 'Load Catalog Entry',
                selectedId,
                thumbHeightPx: 168,
                optionMinWidthPx: 192,
                thumbImageScale: 1.0,
                thumbImageFit: 'contain',
                sections,
                onSelect: (option) => {
                    const parsed = parsePickerOptionId(option?.id);
                    if (!parsed) return;
                    this._applyCatalogPreset({
                        assetType: parsed.assetType,
                        catalogId: parsed.catalogId,
                        emit: true
                    });
                }
            });
        } finally {
            if (this._controls.assetLoadBtn) this._controls.assetLoadBtn.disabled = false;
        }
    }

    _forceDecorationDisabled(decoration) {
        const disabled = sanitizeWindowDecorationState(decoration, {
            wallMaterialId: String(this._state.wallMaterialId ?? '')
        });
        const next = { ...disabled };
        for (const partId of [WINDOW_DECORATION_PART.SILL, WINDOW_DECORATION_PART.HEADER, WINDOW_DECORATION_PART.TRIM]) {
            const part = next?.[partId];
            if (!part || typeof part !== 'object') continue;
            next[partId] = { ...part, enabled: false };
        }
        return sanitizeWindowDecorationState(next, {
            wallMaterialId: String(this._state.wallMaterialId ?? '')
        });
    }

    _applyModeConstraints({ mode, settings, layers, decoration }) {
        const assetMode = normalizeWindowFabricationAssetType(mode, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const srcSettings = settings && typeof settings === 'object' ? settings : this._state.settings;
        const srcLayers = layers && typeof layers === 'object' ? layers : this._state.layers;
        const srcDecoration = decoration && typeof decoration === 'object' ? decoration : this._state.decoration;

        let nextSettings = sanitizeWindowMeshSettings(srcSettings);
        let nextLayers = { ...srcLayers };
        let nextDecoration = sanitizeWindowDecorationState(srcDecoration, {
            wallMaterialId: String(this._state.wallMaterialId ?? '')
        });

        if (assetMode === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) {
            nextSettings = sanitizeWindowMeshSettings({
                ...nextSettings,
                arch: { ...nextSettings.arch, enabled: false },
                frame: {
                    ...nextSettings.frame,
                    openBottom: true,
                    addHandles: false,
                    doorStyle: 'single',
                    doorBottomFrame: { ...nextSettings.frame.doorBottomFrame, enabled: false, mode: 'none' },
                    doorCenterFrame: { ...nextSettings.frame.doorCenterFrame, leftMode: 'none', rightMode: 'none' }
                },
                muntins: { ...nextSettings.muntins, enabled: false, columns: 1, rows: 1 },
                shade: { ...nextSettings.shade, enabled: false },
                interior: {
                    ...nextSettings.interior,
                    enabled: false,
                    parallaxInteriorPresetId: null,
                    parallaxDepthMeters: 0.0,
                    parallaxScale: { x: 0.0, y: 0.0 }
                }
            });
            nextLayers = {
                ...nextLayers,
                muntins: false,
                glass: false,
                shade: false,
                interior: false
            };
            nextDecoration = this._forceDecorationDisabled(nextDecoration);
        }

        return { settings: nextSettings, layers: nextLayers, decoration: nextDecoration };
    }

    _syncAssetModeUi() {
        const mode = normalizeWindowFabricationAssetType(this._state.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const isDoorMode = mode === WINDOW_FABRICATION_ASSET_TYPE.DOOR;
        const isGarageMode = mode === WINDOW_FABRICATION_ASSET_TYPE.GARAGE;
        const preferredId = this._state.catalogByAssetType?.[mode] ?? this._state.assetCatalogId;
        const resolvedId = this._resolveCatalogId(mode, preferredId);
        const preferredName = this._state.catalogNameByAssetType?.[mode] ?? this._state.assetCatalogName;
        const resolvedName = this._resolveCatalogName(mode, preferredName, resolvedId);
        const constrained = this._applyModeConstraints({
            mode,
            settings: this._state.settings,
            layers: this._state.layers,
            decoration: this._state.decoration
        });
        const garageFacade = this._state.garageFacade && typeof this._state.garageFacade === 'object'
            ? this._state.garageFacade
            : {};

        this._state.assetType = mode;
        this._state.assetCatalogId = resolvedId;
        this._state.catalogByAssetType[mode] = resolvedId;
        this._state.assetCatalogName = resolvedName;
        this._state.catalogNameByAssetType[mode] = resolvedName;
        this._state.settings = constrained.settings;
        this._state.layers = constrained.layers;
        this._state.decoration = constrained.decoration;
        this._state.garageFacade = {
            state: this._resolveGarageFacadeState(garageFacade.state),
            closedMaterialId: this._resolveGarageClosedMaterialId(garageFacade.closedMaterialId),
            rotationDegrees: this._resolveGarageFacadeRotationDegrees(garageFacade.rotationDegrees)
        };

        if (this._controls.assetType?.setValue) this._controls.assetType.setValue(mode);
        if (this._controls.assetCatalogName?.input) {
            this._controls.assetCatalogName.input.value = resolvedName;
            this._controls.assetCatalogName.input.placeholder = getAssetCatalogFallbackName(mode);
        }
        if (this._controls.assetCatalogNameLabel) {
            this._controls.assetCatalogNameLabel.textContent = mode === WINDOW_FABRICATION_ASSET_TYPE.DOOR
                ? 'Catalog Name'
                : (mode === WINDOW_FABRICATION_ASSET_TYPE.GARAGE ? 'Garage Catalog Name' : 'Window Catalog Name');
        }
        this._syncWallControlsFromState();

        const syncLayerControl = (key, disabled) => {
            const ctrl = this._controls[`layer_${key}`];
            if (!ctrl?.toggle) return;
            ctrl.toggle.disabled = !!disabled;
            ctrl.toggle.checked = this._state.layers?.[key] !== false;
        };
        syncLayerControl('muntins', isGarageMode);
        syncLayerControl('glass', isGarageMode);
        syncLayerControl('shade', isDoorMode || isGarageMode);
        syncLayerControl('interior', isDoorMode || isGarageMode);

        const layerPresetAllBtn = this._controls.layerPresetAllBtn;
        const layerPresetGlassOnlyBtn = this._controls.layerPresetGlassOnlyBtn;
        const layerPresetInteriorOnlyBtn = this._controls.layerPresetInteriorOnlyBtn;
        if (layerPresetAllBtn) layerPresetAllBtn.disabled = isGarageMode;
        if (layerPresetGlassOnlyBtn) layerPresetGlassOnlyBtn.disabled = isGarageMode;
        if (layerPresetInteriorOnlyBtn) layerPresetInteriorOnlyBtn.disabled = isDoorMode || isGarageMode;

        const frameSettings = this._state.settings?.frame ?? {};
        if (this._controls.frameDoorStyle?.setValue) this._controls.frameDoorStyle.setValue(String(frameSettings.doorStyle ?? 'single'));
        if (this._controls.frameDoorBottomMode?.setValue) this._controls.frameDoorBottomMode.setValue(String(frameSettings.doorBottomFrame?.mode ?? 'match'));
        if (this._controls.frameDoorCenterLeft?.setValue) this._controls.frameDoorCenterLeft.setValue(String(frameSettings.doorCenterFrame?.leftMode ?? 'match'));
        if (this._controls.frameDoorCenterRight?.setValue) this._controls.frameDoorCenterRight.setValue(String(frameSettings.doorCenterFrame?.rightMode ?? 'match'));
        if (this._controls.frameHandleMaterialMode?.setValue) this._controls.frameHandleMaterialMode.setValue(String(frameSettings.handleMaterialMode ?? 'match'));
        if (this._controls.frameDoorBottomEnabled?.toggle) {
            this._controls.frameDoorBottomEnabled.toggle.checked = !!frameSettings.doorBottomFrame?.enabled;
            this._controls.frameDoorBottomEnabled.toggle.disabled = !isDoorMode;
        }
        if (this._controls.frameAddHandles?.toggle) {
            this._controls.frameAddHandles.toggle.checked = !!frameSettings.addHandles;
            this._controls.frameAddHandles.toggle.disabled = !isDoorMode;
        }
        this._controls.syncFrameStyleRows?.();

        const archSection = this._controls.sectionArch;
        if (archSection?.style) archSection.style.display = isGarageMode ? 'none' : '';
        const muntinsSection = this._controls.sectionMuntins;
        if (muntinsSection?.style) muntinsSection.style.display = isGarageMode ? 'none' : '';
        const decorationSection = this._controls.sectionDecoration;
        if (decorationSection?.style) decorationSection.style.display = isGarageMode ? 'none' : '';

        const interiorSection = this._controls.sectionInterior;
        if (interiorSection?.style) interiorSection.style.display = (isDoorMode || isGarageMode) ? 'none' : '';
        const facadeSection = this._controls.sectionFacade;
        if (facadeSection?.style) facadeSection.style.display = isGarageMode ? '' : 'none';
        const garageMaterialPicker = this._controls.garageClosedMaterial;
        if (garageMaterialPicker?.btn) garageMaterialPicker.btn.disabled = !isGarageMode;

        const tabVisibility = {
            facade: isGarageMode,
            glass: !isGarageMode,
            shade: !(isDoorMode || isGarageMode),
            decoration: !isGarageMode,
            interior: !(isDoorMode || isGarageMode)
        };
        for (const [tabId, visible] of Object.entries(tabVisibility)) {
            const tabBtn = this._tabButtons?.[tabId] ?? null;
            if (tabBtn?.style) tabBtn.style.display = visible ? '' : 'none';
            const body = this._tabBodies?.[tabId] ?? null;
            if (body?.style) body.style.display = visible ? '' : 'none';
            if (!visible && this._tab === tabId) this._setActiveTab('scene');
        }

        this._syncGarageFacadeMaterialPicker();
        if (this._controls.garageFacadeState?.setValue) {
            this._controls.garageFacadeState.setValue(this._state.garageFacade.state);
            this._controls.garageFacadeState.setDisabled(!isGarageMode);
        }
        if (this._controls.garageFacadeRotation?.setValue) {
            this._controls.garageFacadeRotation.setValue(String(this._state.garageFacade.rotationDegrees));
            this._controls.garageFacadeRotation.setDisabled(!isGarageMode);
        }

        const modeNote = this._controls.assetModeNote;
        if (modeNote) {
            modeNote.textContent = isDoorMode
                ? 'Door mode renders a base-aligned door (single or double style), disables shade + interior parallax, and uses door entries in the thumbnail loader.'
                : (isGarageMode
                    ? 'Garage mode renders one base-aligned opening, hides glass/shade/decoration workflows, and uses the Facade tab for open/closed + metal panel control.'
                    : 'Window mode renders the preview grid and uses window entries in the thumbnail loader.');
        }
    }

    _applyCatalogPreset({ assetType = null, catalogId = null, emit = true, applyEntry = true } = {}) {
        const mode = normalizeWindowFabricationAssetType(assetType ?? this._state.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const resolvedCatalogId = this._resolveCatalogId(mode, catalogId ?? this._state.catalogByAssetType?.[mode]);
        const entry = applyEntry ? this._getCatalogEntryById(mode, resolvedCatalogId) : null;
        if (!entry) {
            this._state.assetType = mode;
            this._state.assetCatalogId = resolvedCatalogId;
            this._state.catalogByAssetType[mode] = resolvedCatalogId;
            this._state.assetCatalogName = this._resolveCatalogName(mode, this._state.assetCatalogName, resolvedCatalogId);
            this._state.catalogNameByAssetType[mode] = this._state.assetCatalogName;
            if (mode === WINDOW_FABRICATION_ASSET_TYPE.WINDOW) this._state.layers.interior = true;
            const constrained = this._applyModeConstraints({
                mode,
                settings: this._state.settings,
                layers: this._state.layers,
                decoration: this._state.decoration
            });
            this._state.settings = constrained.settings;
            this._state.layers = constrained.layers;
            this._state.decoration = constrained.decoration;

            this._syncAssetModeUi();
            if (emit) this._emit();
            return;
        }

        this._state.assetType = mode;
        this._state.assetCatalogId = resolvedCatalogId;
        this._state.catalogByAssetType[mode] = resolvedCatalogId;
        this._state.assetCatalogName = this._resolveCatalogName(mode, entry.name ?? entry.label, resolvedCatalogId);
        this._state.catalogNameByAssetType[mode] = this._state.assetCatalogName;

        const defaults = getDefaultWindowMeshSettings();
        let nextSettings = sanitizeWindowMeshSettings({
            ...defaults,
            ...(entry.settings ?? {})
        });
        let nextLayers = {
            ...this._state.layers,
            ...(entry.layers && typeof entry.layers === 'object' ? entry.layers : {})
        };
        const wall = entry.wall && typeof entry.wall === 'object' ? entry.wall : null;
        const decorationWallMaterialId = typeof wall?.materialId === 'string' && wall.materialId.trim()
            ? wall.materialId.trim()
            : String(this._state.wallMaterialId ?? '');
        const nextDecoration = sanitizeWindowDecorationState(entry.decoration, {
            wallMaterialId: decorationWallMaterialId
        });
        if (mode === WINDOW_FABRICATION_ASSET_TYPE.WINDOW) {
            if (entry.layers && typeof entry.layers === 'object') nextLayers.interior = entry.layers.interior !== false;
            else nextLayers.interior = true;
        }
        const constrained = this._applyModeConstraints({
            mode,
            settings: nextSettings,
            layers: nextLayers,
            decoration: nextDecoration
        });

        this._state.settings = constrained.settings;
        this._state.layers = constrained.layers;
        this._state.decoration = constrained.decoration;
        if (entry?.garageFacade && typeof entry.garageFacade === 'object') {
            this._state.garageFacade = {
                state: this._resolveGarageFacadeState(entry.garageFacade.state),
                closedMaterialId: this._resolveGarageClosedMaterialId(entry.garageFacade.closedMaterialId),
                rotationDegrees: this._resolveGarageFacadeRotationDegrees(entry.garageFacade.rotationDegrees)
            };
        }
        if (wall) {
            if (typeof wall.materialId === 'string') this._state.wallMaterialId = wall.materialId;
            if (Number.isFinite(wall.roughness)) this._state.wallRoughness = Number(wall.roughness);
            if (Number.isFinite(wall.normalIntensity)) this._state.wallNormalIntensity = Number(wall.normalIntensity);
            if (Number.isFinite(wall.cutWidthLerp)) this._state.wallCutWidthLerp = clamp(wall.cutWidthLerp, -1.0, 1.0, 0.0);
            if (Number.isFinite(wall.cutHeightLerp)) this._state.wallCutHeightLerp = clamp(wall.cutHeightLerp, -1.0, 1.0, 0.0);
            if (Number.isFinite(wall.floorDistanceMeters)) this._state.floorDistanceMeters = clamp(wall.floorDistanceMeters, 0.0, 32.0, 0.0);
        }
        this._syncWallControlsFromState();

        if (typeof entry.seed === 'string' && entry.seed.trim()) this._state.seed = entry.seed.trim();
        if (entry.ibl && typeof entry.ibl === 'object') {
            this._state.ibl = {
                ...this._state.ibl,
                ...deepClone(entry.ibl)
            };
        }

        this._rebuildControlsFromState({ keepActiveTab: true });
        if (emit) this._emit();
    }

    async _exportCurrentConfig() {
        const mode = normalizeWindowFabricationAssetType(this._state.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
        const catalogId = this._resolveCatalogId(mode, this._state.assetCatalogId);
        const fallbackName = getAssetCatalogFallbackName(mode);
        const catalogName = this._resolveCatalogName(mode, this._state.assetCatalogName, catalogId) || fallbackName;
        this._state.assetCatalogName = catalogName;
        this._state.catalogNameByAssetType[mode] = catalogName;
        if (this._controls.assetCatalogName?.input) this._controls.assetCatalogName.input.value = catalogName;

        const constrained = this._applyModeConstraints({
            mode,
            settings: this._state.settings,
            layers: this._state.layers,
            decoration: this._state.decoration
        });
        const settings = constrained.settings;
        const layers = constrained.layers;
        const garageFacade = {
            state: this._resolveGarageFacadeState(this._state?.garageFacade?.state),
            closedMaterialId: this._resolveGarageClosedMaterialId(this._state?.garageFacade?.closedMaterialId),
            rotationDegrees: this._resolveGarageFacadeRotationDegrees(this._state?.garageFacade?.rotationDegrees)
        };

        const wallMaterialId = String(this._state.wallMaterialId ?? '');
        const wallConfig = {
            materialId: wallMaterialId,
            roughness: Number(this._state.wallRoughness) || 0,
            normalIntensity: Number(this._state.wallNormalIntensity) || 0,
            floorDistanceMeters: clamp(this._state.floorDistanceMeters, 0.0, 32.0, 0.0)
        };
        let thumbnailDataUrl = null;
        if (this._captureThumbnail) {
            try {
                const captured = await Promise.resolve(this._captureThumbnail({
                    reason: 'window_fabrication_export',
                    assetType: mode,
                    catalogName,
                    seed: String(this._state.seed ?? 'window-debug'),
                    settings: deepClone(settings),
                    wall: wallConfig,
                    garageFacade: deepClone(garageFacade)
                }));
                if (typeof captured === 'string' && captured.startsWith('data:image/')) {
                    thumbnailDataUrl = captured;
                }
            } catch (err) {
                console.warn('[WindowMeshDebuggerUI] Thumbnail capture failed during export.', err);
            }
        }

        const payload = {
            schema: 'bus_sim.window_fabrication_config',
            version: 3,
            exportedAt: new Date().toISOString(),
            assetType: mode,
            catalogId: catalogId || null,
            catalogName,
            seed: String(this._state.seed ?? 'window-debug'),
            settings,
            layers: deepClone(layers),
            garageFacade: deepClone(garageFacade),
            wallMaterialHint: wallMaterialId,
            wall: {
                materialId: wallMaterialId,
                roughness: Number(this._state.wallRoughness) || 0,
                normalIntensity: Number(this._state.wallNormalIntensity) || 0,
                cutWidthLerp: clamp(this._state.wallCutWidthLerp, -1.0, 1.0, 0.0),
                cutHeightLerp: clamp(this._state.wallCutHeightLerp, -1.0, 1.0, 0.0),
                floorDistanceMeters: clamp(this._state.floorDistanceMeters, 0.0, 32.0, 0.0)
            },
            ibl: deepClone(this._state.ibl),
            thumbnail: {
                dataUrl: thumbnailDataUrl,
                wallMaterialId,
                generatedAt: new Date().toISOString(),
                source: 'window_mesh_debugger_viewport_capture_v1'
            }
        };

        const fileToken = toSafeFileToken(catalogName || catalogId || mode, mode);
        const fileName = `window_fabrication_${mode}_${fileToken}.json`;
        const source = `${JSON.stringify(payload, null, 2)}\n`;
        const blob = new Blob([source], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 250);
    }

    _buildSceneSection({ wallOptions, parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Scene', { parent, showTitle });

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

        const wallRow = makeMaterialPickerRow({
            label: 'Wall (PBR)',
            onPick: () => this._openWallMaterialPicker()
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

        this._syncWallControlsFromState();
    }

    _syncWallMaterialPicker() {
        const picker = this._controls?.wall ?? null;
        if (!picker) return;
        const id = String(this._state?.wallMaterialId ?? '');
        const options = getPbrMaterialOptionsForBuildings();
        const found = options.find((opt) => opt?.id === id) ?? options[0] ?? null;
        if (found) this._state.wallMaterialId = String(found.id ?? id);
        this._state.decoration = sanitizeWindowDecorationState(this._state.decoration, {
            wallMaterialId: this._state.wallMaterialId
        });
        const label = found?.label ?? id ?? '';
        picker.textEl.textContent = label;
        setOptionsThumbToTexture(picker.thumb, found?.previewUrl ?? '', label);
    }

    _syncSliderControlValue(row, value, { digits = 2 } = {}) {
        if (!row?.range || !row?.number) return;
        const min = Number(row.range.min);
        const max = Number(row.range.max);
        let v = Number(value);
        if (!Number.isFinite(v)) return;
        if (Number.isFinite(min)) v = Math.max(min, v);
        if (Number.isFinite(max)) v = Math.min(max, v);
        row.range.value = String(v);
        row.number.value = String(v.toFixed(digits));
    }

    _syncWallControlsFromState() {
        this._syncWallMaterialPicker();

        const seedInput = this._controls?.seed?.input ?? null;
        if (seedInput) seedInput.value = String(this._state?.seed ?? '');

        this._syncSliderControlValue(this._controls?.wallRoughness, this._state?.wallRoughness, { digits: 2 });
        this._syncSliderControlValue(this._controls?.wallNormalIntensity, this._state?.wallNormalIntensity, { digits: 2 });
        this._syncSliderControlValue(this._controls?.wallCutWidth, this._state?.wallCutWidthLerp, { digits: 2 });
        this._syncSliderControlValue(this._controls?.wallCutHeight, this._state?.wallCutHeightLerp, { digits: 2 });
        this._syncSliderControlValue(this._controls?.floorDistanceMeters, this._state?.floorDistanceMeters, { digits: 2 });
    }

    _openWallMaterialPicker() {
        const picker = this._controls?.wall ?? null;
        if (!picker || picker.btn?.disabled) return;

        const sections = getPbrMaterialClassSectionsForBuildings().map((section) => ({
            label: section.label,
            options: (section.options ?? []).map((opt) => ({
                id: opt.id,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl ?? null
            }))
        }));

        this._catalogPicker?.open?.({
            title: 'Wall Material',
            sections,
            selectedId: String(this._state?.wallMaterialId ?? ''),
            onSelect: (opt) => {
                this._state.wallMaterialId = String(opt?.id ?? '');
                this._state.decoration = sanitizeWindowDecorationState(this._state.decoration, {
                    wallMaterialId: this._state.wallMaterialId
                });
                this._syncWallControlsFromState();
                this._emit();
            }
        });
    }

    _syncGarageFacadeMaterialPicker() {
        const picker = this._controls?.garageClosedMaterial ?? null;
        if (!picker) return;
        const options = this._getGarageMetalOptions();
        const id = String(this._state?.garageFacade?.closedMaterialId ?? '');
        const found = options.find((opt) => opt?.id === id) ?? options[0] ?? null;
        if (found) this._state.garageFacade.closedMaterialId = String(found.id ?? id);
        const label = found?.label ?? id ?? '';
        picker.textEl.textContent = label;
        setOptionsThumbToTexture(picker.thumb, found?.previewUrl ?? '', label);
    }

    _openGarageFacadeMaterialPicker() {
        const picker = this._controls?.garageClosedMaterial ?? null;
        if (!picker || picker.btn?.disabled) return;
        const options = this._getGarageMetalOptions();
        if (!options.length) return;
        const section = {
            label: 'Metal',
            options: options.map((opt) => ({
                id: opt.id,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl ?? null
            }))
        };
        this._catalogPicker?.open?.({
            title: 'Garage Closed Material',
            sections: [section],
            selectedId: String(this._state?.garageFacade?.closedMaterialId ?? ''),
            onSelect: (opt) => {
                const nextId = this._resolveGarageClosedMaterialId(String(opt?.id ?? ''));
                this._state.garageFacade.closedMaterialId = nextId;
                this._syncGarageFacadeMaterialPicker();
                this._emit();
            }
        });
    }

    _buildLayersSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Layers', { parent, showTitle });

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
            const constrained = this._applyModeConstraints({
                mode: this._state.assetType,
                settings: this._state.settings,
                layers: this._state.layers,
                decoration: this._state.decoration
            });
            this._state.settings = constrained.settings;
            this._state.layers = constrained.layers;
            this._state.decoration = constrained.decoration;
            for (const key of ['frame', 'muntins', 'glass', 'shade', 'interior']) {
                const ctrl = this._controls[`layer_${key}`];
                if (ctrl?.toggle) ctrl.toggle.checked = this._state.layers?.[key] !== false;
            }
            this._emit();
        };

        const btnAll = makeEl('button', 'options-choice-btn', 'All');
        btnAll.type = 'button';
        btnAll.addEventListener('click', () => applyPreset({ frame: true, muntins: true, glass: true, shade: true, interior: true }));
        presetButtons.appendChild(btnAll);
        this._controls.layerPresetAllBtn = btnAll;

        const btnGlassOnly = makeEl('button', 'options-choice-btn', 'Glass Only');
        btnGlassOnly.type = 'button';
        btnGlassOnly.addEventListener('click', () => applyPreset({ frame: false, muntins: false, glass: true, shade: false, interior: false }));
        presetButtons.appendChild(btnGlassOnly);
        this._controls.layerPresetGlassOnlyBtn = btnGlassOnly;

        const btnInteriorOnly = makeEl('button', 'options-choice-btn', 'Interior Only');
        btnInteriorOnly.type = 'button';
        btnInteriorOnly.addEventListener('click', () => applyPreset({ frame: false, muntins: false, glass: false, shade: false, interior: true }));
        presetButtons.appendChild(btnInteriorOnly);
        this._controls.layerPresetInteriorOnlyBtn = btnInteriorOnly;

        presetControl.appendChild(presetButtons);
        presetRow.appendChild(presetControl);
        section.appendChild(presetRow);
    }

    _buildSizeSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Size', { parent, showTitle });
        const s0 = this._state.settings;

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

        const floorDistanceRow = makeNumberSliderRow({
            label: 'Distance from Floor (m)',
            value: this._state.floorDistanceMeters,
            min: 0.0,
            max: 32.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.floorDistanceMeters = clamp(v, 0.0, 32.0, 0.0);
                this._emit();
            }
        });
        section.appendChild(floorDistanceRow.row);
        this._controls.floorDistanceMeters = floorDistanceRow;

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

        const wallCutWidthRow = makeNumberSliderRow({
            label: 'Wall Cut Width (-1=Oversize · 0=Outer · 1=Inner)',
            value: this._state.wallCutWidthLerp,
            min: -1.0,
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
            label: 'Wall Cut Height (-1=Oversize · 0=Outer · 1=Inner)',
            value: this._state.wallCutHeightLerp,
            min: -1.0,
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
    }

    _buildFrameSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Frame', { parent, showTitle });
        const s0 = this._state.settings;
        const frameVerticalWidth0 = Number(s0.frame.verticalWidth ?? s0.frame.width);
        const frameHorizontalWidth0 = Number(s0.frame.horizontalWidth ?? s0.frame.width);

        section.appendChild(makeToggleRow({
            label: 'Bevel Exaggerate',
            value: this._state.debug.bevelExaggerate,
            onChange: (v) => {
                this._state.debug.bevelExaggerate = !!v;
                this._emit();
            }
        }).row);

        section.appendChild(makeToggleRow({
            label: 'Link Widths',
            value: this._state.debug.linkFrameThickness,
            onChange: (v) => {
                this._state.debug.linkFrameThickness = !!v;
                if (!this._state.debug.linkFrameThickness) return;
                const s = this._state.settings;
                const next = clamp(s.frame.verticalWidth ?? s.frame.width, 0.005, 0.35);
                this._setSettings({
                    frame: {
                        ...s.frame,
                        width: next,
                        verticalWidth: next,
                        horizontalWidth: next
                    }
                });
                verticalWidthRow.range.value = String(next);
                verticalWidthRow.number.value = String(next.toFixed(3));
                horizontalWidthRow.range.value = String(next);
                horizontalWidthRow.number.value = String(next.toFixed(3));
            }
        }).row);

        let horizontalWidthRow = null;
        const verticalWidthRow = makeNumberSliderRow({
            label: 'Vertical Width (m)',
            value: frameVerticalWidth0,
            min: 0.005,
            max: 0.35,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                if (this._state.debug.linkFrameThickness) {
                    this._setSettings({
                        frame: {
                            ...s.frame,
                            width: v,
                            verticalWidth: v,
                            horizontalWidth: v
                        }
                    });
                    if (horizontalWidthRow) {
                        const next = clamp(v, 0.005, 0.35);
                        horizontalWidthRow.range.value = String(next);
                        horizontalWidthRow.number.value = String(next.toFixed(3));
                    }
                    return;
                }
                this._setSettings({ frame: { ...s.frame, width: v, verticalWidth: v } });
            }
        });
        section.appendChild(verticalWidthRow.row);

        horizontalWidthRow = makeNumberSliderRow({
            label: 'Horizontal Width (m)',
            value: frameHorizontalWidth0,
            min: 0.005,
            max: 0.35,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                const s = this._state.settings;
                if (this._state.debug.linkFrameThickness) {
                    this._setSettings({
                        frame: {
                            ...s.frame,
                            width: v,
                            verticalWidth: v,
                            horizontalWidth: v
                        }
                    });
                    const next = clamp(v, 0.005, 0.35);
                    verticalWidthRow.range.value = String(next);
                    verticalWidthRow.number.value = String(next.toFixed(3));
                    return;
                }
                this._setSettings({ frame: { ...s.frame, horizontalWidth: v } });
            }
        });
        section.appendChild(horizontalWidthRow.row);

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

        const styleTitle = makeEl('div', 'options-section-title', 'Style');
        section.appendChild(styleTitle);

        const doorStyle = makeChoiceRow({
            label: 'Door Frame Style',
            value: String(s0.frame.doorStyle ?? 'single'),
            options: [
                { id: 'single', label: 'Single' },
                { id: 'double', label: 'Double' }
            ],
            onChange: (id) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, doorStyle: String(id ?? 'single') } });
                syncDoorStyleControls();
            }
        });
        section.appendChild(doorStyle.row);
        this._controls.frameDoorStyle = doorStyle;

        const doorBottomEnabled = makeToggleRow({
            label: 'Bottom Frame',
            value: !!s0.frame.doorBottomFrame?.enabled,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({
                    frame: {
                        ...s.frame,
                        doorBottomFrame: { ...(s.frame.doorBottomFrame ?? {}), enabled: !!v }
                    }
                });
                syncDoorStyleControls();
            }
        });
        section.appendChild(doorBottomEnabled.row);
        this._controls.frameDoorBottomEnabled = doorBottomEnabled;

        const doorBottomMode = makeChoiceRow({
            label: 'Bottom Frame Mode',
            value: String(s0.frame.doorBottomFrame?.mode ?? 'match'),
            options: [
                { id: 'match', label: 'Match' },
                { id: 'none', label: 'None' }
            ],
            onChange: (id) => {
                const s = this._state.settings;
                this._setSettings({
                    frame: {
                        ...s.frame,
                        doorBottomFrame: { ...(s.frame.doorBottomFrame ?? {}), mode: String(id ?? 'match') }
                    }
                });
                syncDoorStyleControls();
            }
        });
        section.appendChild(doorBottomMode.row);
        this._controls.frameDoorBottomMode = doorBottomMode;

        const doorCenterLeft = makeChoiceRow({
            label: 'Left Leaf Center Side',
            value: String(s0.frame.doorCenterFrame?.leftMode ?? 'match'),
            options: [
                { id: 'match', label: 'Match' },
                { id: 'none', label: 'None' }
            ],
            onChange: (id) => {
                const s = this._state.settings;
                this._setSettings({
                    frame: {
                        ...s.frame,
                        doorCenterFrame: { ...(s.frame.doorCenterFrame ?? {}), leftMode: String(id ?? 'match') }
                    }
                });
            }
        });
        section.appendChild(doorCenterLeft.row);
        this._controls.frameDoorCenterLeft = doorCenterLeft;

        const doorCenterRight = makeChoiceRow({
            label: 'Right Leaf Center Side',
            value: String(s0.frame.doorCenterFrame?.rightMode ?? 'match'),
            options: [
                { id: 'match', label: 'Match' },
                { id: 'none', label: 'None' }
            ],
            onChange: (id) => {
                const s = this._state.settings;
                this._setSettings({
                    frame: {
                        ...s.frame,
                        doorCenterFrame: { ...(s.frame.doorCenterFrame ?? {}), rightMode: String(id ?? 'match') }
                    }
                });
            }
        });
        section.appendChild(doorCenterRight.row);
        this._controls.frameDoorCenterRight = doorCenterRight;

        const addHandles = makeToggleRow({
            label: 'Add handles',
            value: !!s0.frame.addHandles,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, addHandles: !!v } });
            }
        });
        section.appendChild(addHandles.row);
        this._controls.frameAddHandles = addHandles;

        const handleMaterialMode = makeChoiceRow({
            label: 'Handle Material',
            value: String(s0.frame.handleMaterialMode ?? 'match'),
            options: [
                { id: 'match', label: 'Match' },
                { id: 'metal', label: 'Metal' }
            ],
            onChange: (id) => {
                const s = this._state.settings;
                this._setSettings({ frame: { ...s.frame, handleMaterialMode: String(id ?? 'match') } });
            }
        });
        section.appendChild(handleMaterialMode.row);
        this._controls.frameHandleMaterialMode = handleMaterialMode;

        const syncDoorStyleControls = () => {
            const mode = normalizeWindowFabricationAssetType(this._state.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
            const isDoorMode = mode === WINDOW_FABRICATION_ASSET_TYPE.DOOR;
            const frame = this._state.settings?.frame ?? {};
            const isDouble = String(frame?.doorStyle ?? 'single') === 'double';
            const bottomEnabled = !!frame?.doorBottomFrame?.enabled;

            if (styleTitle?.style) styleTitle.style.display = isDoorMode ? '' : 'none';
            if (doorStyle?.row?.style) doorStyle.row.style.display = isDoorMode ? '' : 'none';
            if (doorBottomEnabled?.row?.style) doorBottomEnabled.row.style.display = isDoorMode ? '' : 'none';
            if (doorBottomMode?.row?.style) doorBottomMode.row.style.display = isDoorMode ? '' : 'none';
            if (addHandles?.row?.style) addHandles.row.style.display = isDoorMode ? '' : 'none';
            if (handleMaterialMode?.row?.style) handleMaterialMode.row.style.display = isDoorMode ? '' : 'none';
            if (doorCenterLeft?.row?.style) doorCenterLeft.row.style.display = (isDoorMode && isDouble) ? '' : 'none';
            if (doorCenterRight?.row?.style) doorCenterRight.row.style.display = (isDoorMode && isDouble) ? '' : 'none';

            doorStyle.setDisabled(!isDoorMode);
            doorBottomMode.setDisabled(!isDoorMode || !bottomEnabled);
            doorCenterLeft.setDisabled(!isDoorMode || !isDouble);
            doorCenterRight.setDisabled(!isDoorMode || !isDouble);
            handleMaterialMode.setDisabled(!isDoorMode);
            if (addHandles?.toggle) addHandles.toggle.disabled = !isDoorMode;
        };
        this._controls.syncFrameStyleRows = syncDoorStyleControls;
        syncDoorStyleControls();

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

    _buildFacadeSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Facade', { parent, showTitle });
        this._controls.sectionFacade = section;
        section.appendChild(makeEl(
            'div',
            'options-note',
            'Garage mode only. Closed renders a metal panel; Open cuts the wall and spawns a concrete room volume behind the opening.'
        ));

        const stateRow = makeChoiceRow({
            label: 'Garage State',
            value: this._resolveGarageFacadeState(this._state?.garageFacade?.state),
            options: [
                { id: GARAGE_FACADE_STATE.CLOSED, label: 'Closed' },
                { id: GARAGE_FACADE_STATE.OPEN, label: 'Open' }
            ],
            onChange: (id) => {
                this._state.garageFacade.state = this._resolveGarageFacadeState(id);
                this._emit();
            }
        });
        section.appendChild(stateRow.row);
        this._controls.garageFacadeState = stateRow;

        const rotationRow = makeChoiceRow({
            label: 'Facade Rotation',
            value: String(this._resolveGarageFacadeRotationDegrees(this._state?.garageFacade?.rotationDegrees)),
            options: GARAGE_FACADE_ROTATION_OPTIONS,
            onChange: (id) => {
                this._state.garageFacade.rotationDegrees = this._resolveGarageFacadeRotationDegrees(id);
                this._emit();
            }
        });
        section.appendChild(rotationRow.row);
        this._controls.garageFacadeRotation = rotationRow;

        const materialRow = makeMaterialPickerRow({
            label: 'Closed Material (Metal)',
            tooltip: 'Garage closed panel material.',
            onPick: () => this._openGarageFacadeMaterialPicker()
        });
        section.appendChild(materialRow.row);
        this._controls.garageClosedMaterial = materialRow;
        this._syncGarageFacadeMaterialPicker();
    }

    _buildArchSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Arch', { parent, showTitle });
        this._controls.sectionArch = section;
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

        const applyArchPreset = ({ meetsRectangleFrame, topPieceMode: presetTopPieceMode, clipVerticalMuntinsToRectWhenNoTopPiece }) => {
            const s = this._state.settings;
            this._setSettings({
                arch: {
                    ...s.arch,
                    enabled: true,
                    meetsRectangleFrame: !!meetsRectangleFrame,
                    topPieceMode: String(presetTopPieceMode ?? s.arch.topPieceMode),
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

    _buildMuntinsSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Muntins', { parent, showTitle });
        this._controls.sectionMuntins = section;
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

    _buildGlassSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Glass', { parent, showTitle });
        const s0 = this._state.settings;

        let presetRow = null;
        let opacityRow = null;
        let tintRow = null;
        let zOffsetRow = null;
        let metalnessRow = null;
        let roughnessRow = null;
        let transmissionRow = null;
        let iorRow = null;
        let envMapIntensityRow = null;

        const syncSliderRow = (row, value, digits) => {
            if (!row?.range || !row?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            row.range.value = String(v);
            row.number.value = String(v.toFixed(digits));
        };

        const syncColorControlRow = (row, colorHex) => {
            if (!row?.color || !row?.text) return;
            const hex = hexFromColorHex(colorHex);
            row.color.value = hex;
            row.text.value = hex;
        };

        const syncPresetControl = () => {
            if (!presetRow?.select) return;
            const detectedPresetId = detectWindowGlassPresetId(this._state.settings?.glass) ?? WINDOW_GLASS_PRESET_CUSTOM_ID;
            presetRow.select.value = detectedPresetId;
        };

        const syncGlassControlsFromState = () => {
            const glass = this._state?.settings?.glass;
            if (!glass || typeof glass !== 'object') return;
            syncSliderRow(opacityRow, glass.opacity, 2);
            syncColorControlRow(tintRow, glass.tintHex);
            syncSliderRow(zOffsetRow, glass.zOffset, 2);
            syncSliderRow(metalnessRow, glass.reflection?.metalness, 2);
            syncSliderRow(roughnessRow, glass.reflection?.roughness, 2);
            syncSliderRow(transmissionRow, glass.reflection?.transmission, 2);
            syncSliderRow(iorRow, glass.reflection?.ior, 2);
            syncSliderRow(envMapIntensityRow, glass.reflection?.envMapIntensity, 2);
            syncPresetControl();
        };

        presetRow = makeSelectRow({
            label: 'Preset',
            value: detectWindowGlassPresetId(s0.glass) ?? WINDOW_GLASS_PRESET_CUSTOM_ID,
            options: [
                { id: WINDOW_GLASS_PRESET_CUSTOM_ID, label: 'Custom' },
                ...getWindowGlassPresetOptions()
            ],
            onChange: (id) => {
                const preset = getWindowGlassPresetById(id);
                if (!preset) {
                    syncPresetControl();
                    return;
                }
                const s = this._state.settings;
                this._setSettings({
                    glass: {
                        ...s.glass,
                        opacity: preset.opacity,
                        tintHex: preset.tintHex,
                        reflection: { ...s.glass.reflection, ...preset.reflection }
                    }
                });
                syncGlassControlsFromState();
            }
        });
        section.appendChild(presetRow.row);

        opacityRow = makeNumberSliderRow({
            label: 'Opacity',
            value: s0.glass.opacity,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ glass: { ...s.glass, opacity: v } });
                syncPresetControl();
            }
        });
        section.appendChild(opacityRow.row);

        tintRow = makeColorRow({
            label: 'Tint',
            value: hexFromColorHex(s0.glass.tintHex),
            onChange: (hex) => {
                const s = this._state.settings;
                this._setSettings({ glass: { ...s.glass, tintHex: colorHexFromHexString(hex) } });
                syncPresetControl();
            }
        });
        section.appendChild(tintRow.row);

        zOffsetRow = makeNumberSliderRow({
            label: 'Z Offset (m)',
            value: s0.glass.zOffset,
            min: -0.25,
            max: 0.25,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ glass: { ...s.glass, zOffset: v } });
                syncPresetControl();
            }
        });
        section.appendChild(zOffsetRow.row);

        metalnessRow = makeNumberSliderRow({
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
                syncPresetControl();
            }
        });
        section.appendChild(metalnessRow.row);

        roughnessRow = makeNumberSliderRow({
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
                syncPresetControl();
            }
        });
        section.appendChild(roughnessRow.row);

        transmissionRow = makeNumberSliderRow({
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
                syncPresetControl();
            }
        });
        section.appendChild(transmissionRow.row);

        iorRow = makeNumberSliderRow({
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
                syncPresetControl();
            }
        });
        section.appendChild(iorRow.row);

        envMapIntensityRow = makeNumberSliderRow({
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
                syncPresetControl();
            }
        });
        section.appendChild(envMapIntensityRow.row);

        syncGlassControlsFromState();
    }

    _buildShadeSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Shade', { parent, showTitle });
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

    _buildDecorationSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Decoration', { parent, showTitle });
        this._controls.sectionDecoration = section;
        section.appendChild(makeEl(
            'div',
            'options-note',
            'Decoration templates are visualization-only; exports do not include decoration settings.'
        ));

        const updatePart = (partId, mutate) => {
            const current = this._state.decoration?.[partId] ?? {};
            const nextPart = typeof mutate === 'function'
                ? (mutate({ ...current }) ?? current)
                : { ...current, ...(mutate ?? {}) };
            this._state.decoration = sanitizeWindowDecorationState({
                ...this._state.decoration,
                [partId]: nextPart
            }, {
                wallMaterialId: String(this._state.wallMaterialId ?? '')
            });
            this._emit();
            return this._state.decoration?.[partId] ?? nextPart;
        };

        const applyTypeSuggestions = (partId, typeId, partState) => {
            const next = partState && typeof partState === 'object' ? partState : {};
            const meta = getWindowDecorationTypeMetadata(partId, typeId);
            const suggestions = meta?.suggestions ?? null;
            if (!suggestions || typeof suggestions !== 'object') return next;

            const parsedDepth = Number(suggestions.depthMeters);
            const hasDepthSuggestion = Number.isFinite(parsedDepth);
            return {
                ...next,
                widthMode: typeof suggestions.widthMode === 'string' ? suggestions.widthMode : next.widthMode,
                depthMeters: hasDepthSuggestion ? parsedDepth : next.depthMeters,
                material: {
                    ...(next.material ?? {}),
                    mode: typeof suggestions.materialMode === 'string'
                        ? suggestions.materialMode
                        : next?.material?.mode
                }
            };
        };

        const addPartControls = ({ title, partId }) => {
            const part = this._state.decoration?.[partId] ?? null;
            if (!part || typeof part !== 'object') return;

            section.appendChild(makeEl('div', 'options-section-title', title));

            section.appendChild(makeToggleRow({
                label: `${title} Enabled`,
                value: !!part.enabled,
                onChange: (enabled) => updatePart(partId, (next) => ({ ...next, enabled: !!enabled }))
            }).row);

            const typeOptions = getWindowDecorationTypeOptions(partId);
            const fallbackTypeId = String(typeOptions[0]?.id ?? WINDOW_DECORATION_STYLE.SIMPLE);
            const onTypeChange = (typeId) => {
                const nextPart = updatePart(partId, (next) => {
                    const withType = { ...next, type: String(typeId ?? fallbackTypeId) };
                    return applyTypeSuggestions(partId, typeId, withType);
                });
                syncPartControls(nextPart);
            };
            let typeControl = null;
            if (partId === WINDOW_DECORATION_PART.SILL) {
                const typeRow = makeChoiceRow({
                    label: 'Set Type',
                    value: String(part.type ?? fallbackTypeId),
                    options: typeOptions,
                    onChange: onTypeChange
                });
                section.appendChild(typeRow.row);
                typeControl = {
                    setValue: (id) => typeRow.setValue(String(id ?? fallbackTypeId)),
                    hasValue: (id) => typeOptions.some((opt) => String(opt?.id ?? '') === String(id ?? ''))
                };
            } else {
                const typeRow = makeSelectRow({
                    label: `${title} Type`,
                    value: String(part.type ?? fallbackTypeId),
                    options: typeOptions,
                    onChange: onTypeChange
                });
                section.appendChild(typeRow.row);
                typeControl = {
                    setValue: (id) => { typeRow.select.value = String(id ?? fallbackTypeId); },
                    hasValue: (id) => Array.from(typeRow.select.options).some((opt) => opt.value === String(id ?? ''))
                };
            }

            const widthRow = makeChoiceRow({
                label: `${title} Width`,
                value: String(part.widthMode ?? WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW),
                options: [
                    { id: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW, label: 'Match window' },
                    { id: WINDOW_DECORATION_WIDTH_MODE.PCT_15, label: '15%' }
                ],
                onChange: (widthMode) => updatePart(partId, (next) => ({ ...next, widthMode }))
            });
            section.appendChild(widthRow.row);

            const depthMeters = Number(part.depthMeters);
            const defaultDepth = WINDOW_DECORATION_DEPTH_OPTIONS_METERS[0];
            const depthChoiceId = Number.isFinite(depthMeters) ? String(depthMeters) : String(defaultDepth);
            const depthRow = makeChoiceRow({
                label: `${title} Depth`,
                value: depthChoiceId,
                options: WINDOW_DECORATION_DEPTH_OPTIONS_METERS.map((meters) => ({
                    id: String(meters),
                    label: meters.toFixed(2)
                })),
                onChange: (depthId) => {
                    const parsed = Number(depthId);
                    updatePart(partId, (next) => ({ ...next, depthMeters: Number.isFinite(parsed) ? parsed : defaultDepth }));
                }
            });
            section.appendChild(depthRow.row);

            const materialRow = makeChoiceRow({
                label: `${title} Material`,
                value: String(part.material?.mode ?? WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL),
                options: [
                    { id: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL, label: 'Match wall' },
                    { id: WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME, label: 'Match frame' },
                    { id: WINDOW_DECORATION_MATERIAL_MODE.PBR, label: 'PBR' }
                ],
                onChange: (mode) => updatePart(partId, (next) => ({
                    ...next,
                    material: {
                        ...(next.material ?? {}),
                        mode
                    }
                }))
            });
            section.appendChild(materialRow.row);

            const syncPartControls = (partState) => {
                const next = partState && typeof partState === 'object' ? partState : {};
                const typeValue = String(next.type ?? fallbackTypeId);
                const hasTypeValue = typeControl?.hasValue?.(typeValue) === true;
                typeControl?.setValue?.(hasTypeValue ? typeValue : fallbackTypeId);
                widthRow.setValue(String(next.widthMode ?? WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW));

                const nextDepth = Number(next.depthMeters);
                const depthValue = Number.isFinite(nextDepth) ? String(nextDepth) : String(defaultDepth);
                depthRow.setValue(depthValue);
                materialRow.setValue(String(next.material?.mode ?? WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL));
            };

            syncPartControls(part);
        };

        addPartControls({ title: 'Sill', partId: WINDOW_DECORATION_PART.SILL });
        addPartControls({ title: 'Header', partId: WINDOW_DECORATION_PART.HEADER });
        addPartControls({ title: 'Trim', partId: WINDOW_DECORATION_PART.TRIM });

        section.appendChild(makeEl(
            'div',
            'options-note',
            'Template gap and offsets are system-derived for consistent placement and are not user-editable.'
        ));
    }

    _buildInteriorSection({ parent = this.body, showTitle = true } = {}) {
        const section = this._buildSection('Interior', { parent, showTitle });
        this._controls.sectionInterior = section;
        const s0 = this._state.settings;
        const CUSTOM_PRESET_ID = '__custom__';
        const presetOptions = getParallaxInteriorPresetOptions();
        const presetId = typeof s0.interior.parallaxInteriorPresetId === 'string' && s0.interior.parallaxInteriorPresetId
            ? s0.interior.parallaxInteriorPresetId
            : CUSTOM_PRESET_ID;

        section.appendChild(makeToggleRow({
            label: 'Enabled',
            value: s0.interior.enabled,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, enabled: v } });
            }
        }).row);

        const presetRow = makeSelectRow({
            label: 'Parallax Interior',
            value: presetId,
            options: [
                { id: CUSTOM_PRESET_ID, label: 'Custom (manual)' },
                ...presetOptions
            ],
            onChange: (id) => {
                const selected = String(id ?? '');
                const s = this._state.settings;
                this._setSettings({
                    interior: {
                        ...s.interior,
                        parallaxInteriorPresetId: selected === CUSTOM_PRESET_ID ? null : selected
                    }
                });
                syncPresetLocks();
            }
        });
        section.appendChild(presetRow.row);

        let advancedCollapsed = true;
        const advanced = makeEl('div', 'options-section');
        const advancedHeader = makeEl('div', 'options-section-header');
        advancedHeader.setAttribute('role', 'button');
        advancedHeader.tabIndex = 0;
        const advancedTitle = makeEl('div', 'options-section-title', 'Advanced');
        const advancedBtn = makeEl('button', 'options-btn options-btn-small options-icon-btn', advancedCollapsed ? '▸' : '▾');
        advancedBtn.type = 'button';

        const applyAdvancedCollapsed = () => {
            advanced.classList.toggle('is-collapsed', advancedCollapsed);
            advancedBtn.textContent = advancedCollapsed ? '▸' : '▾';
            advancedBtn.title = advancedCollapsed ? 'Expand' : 'Collapse';
            advancedBtn.setAttribute('aria-label', advancedCollapsed ? 'Expand' : 'Collapse');
        };

        const toggleAdvancedCollapsed = () => {
            advancedCollapsed = !advancedCollapsed;
            applyAdvancedCollapsed();
        };

        advancedBtn.addEventListener('click', () => toggleAdvancedCollapsed());
        advancedHeader.addEventListener('click', (e) => {
            const btn = e?.target?.closest?.('button');
            if (btn && advancedHeader.contains(btn)) return;
            toggleAdvancedCollapsed();
        });
        advancedHeader.addEventListener('keydown', (e) => {
            const key = e?.key ?? '';
            if (key !== 'Enter' && key !== ' ') return;
            e.preventDefault?.();
            toggleAdvancedCollapsed();
        });

        advancedHeader.appendChild(advancedTitle);
        advancedHeader.appendChild(advancedBtn);
        advanced.appendChild(advancedHeader);

        const note = makeEl('div', 'options-note', 'Atlas/depth/zoom are controlled by the preset. Select Custom to override.');
        advanced.appendChild(note);

        const atlasOptions = getWindowInteriorAtlasOptions({ includeProcedural: true });
        const lockedControls = [];

        const atlasRow = makeSelectRow({
            label: 'Atlas',
            value: String(s0.interior.atlasId ?? atlasOptions[0]?.id ?? ''),
            options: atlasOptions,
            onChange: (id) => {
                const s = this._state.settings;
                const selected = String(id ?? '');
                this._setSettings({ interior: { ...s.interior, atlasId: selected } });
            }
        });
        advanced.appendChild(atlasRow.row);
        lockedControls.push(atlasRow.select);

        advanced.appendChild(makeToggleRow({
            label: 'Randomize Cell',
            value: s0.interior.randomizeCell,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, randomizeCell: v } });
            }
        }).row);

        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeToggleRow({
            label: 'Random Flip X',
            value: s0.interior.randomFlipX,
            onChange: (v) => {
                const s = this._state.settings;
                this._setSettings({ interior: { ...s.interior, randomFlipX: v } });
            }
        }).row);

        const parallaxDepthRow = makeNumberSliderRow({
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
        });
        advanced.appendChild(parallaxDepthRow.row);
        lockedControls.push(parallaxDepthRow.range, parallaxDepthRow.number);

        advanced.appendChild(makeNumberSliderRow({
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

        const zoomRow = makeNumberSliderRow({
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
        });
        advanced.appendChild(zoomRow.row);
        lockedControls.push(zoomRow.range, zoomRow.number);

        advanced.appendChild(makeNumberSliderRow({
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

	        advanced.appendChild(makeNumberSliderRow({
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

	        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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
        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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

        advanced.appendChild(makeNumberSliderRow({
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

        const syncPresetLocks = () => {
            const hasPreset = !!this._state.settings?.interior?.parallaxInteriorPresetId;
            note.textContent = hasPreset
                ? 'Atlas/depth/zoom are controlled by the preset. Select Custom to override.'
                : 'Custom mode: adjust atlas/depth/zoom directly (legacy/manual).';

            const cur = this._state.settings?.interior ?? null;
            if (cur) {
                atlasRow.select.value = String(cur.atlasId ?? atlasRow.select.value);
                parallaxDepthRow.range.value = String(Number(cur.parallaxDepthMeters ?? 0).toFixed(1));
                parallaxDepthRow.number.value = String(Number(cur.parallaxDepthMeters ?? 0).toFixed(1));
                zoomRow.range.value = String(Number(cur.uvZoom ?? 1).toFixed(2));
                zoomRow.number.value = String(Number(cur.uvZoom ?? 1).toFixed(2));
            }

            for (const el of lockedControls) {
                if (!el) continue;
                el.disabled = hasPreset;
            }
        };

        applyAdvancedCollapsed();
        syncPresetLocks();
        section.appendChild(advanced);

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
