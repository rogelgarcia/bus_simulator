// src/graphics/gui/inspector_room/InspectorRoomUI.js
// Unified HUD UI for the Inspector Room.
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';
import {
    lightBiasedSignedExpSliderToValue,
    lightBiasedSignedExpValueToSlider,
    lightHexIntToHueTone,
    lightHueToneToHexInt
} from './InspectorRoomLightUtils.js';

const MODE_OPTIONS = Object.freeze([
    { id: 'meshes', label: 'Meshes' },
    { id: 'textures', label: 'Textures' }
]);

export const INSPECTOR_ROOM_BASE_COLORS = Object.freeze([
    { id: 'white', label: 'White', hex: 0xffffff },
    { id: 'light_gray', label: 'Light gray', hex: 0xd7dde7 },
    { id: 'mid_gray', label: 'Mid gray', hex: 0x8c96a6 },
    { id: 'dark', label: 'Dark', hex: 0x1b2430 },
    { id: 'black', label: 'Black', hex: 0x0b0f14 }
]);

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function formatFloat(value, digits = 5) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return num.toFixed(digits);
}

function formatRectPx(rectPx) {
    const r = rectPx && typeof rectPx === 'object' ? rectPx : null;
    if (!r) return '-';
    const x = Number.isFinite(r.x) ? r.x : '-';
    const y = Number.isFinite(r.y) ? r.y : '-';
    const w = Number.isFinite(r.w) ? r.w : '-';
    const h = Number.isFinite(r.h) ? r.h : '-';
    return `${x},${y},${w},${h}`;
}

function formatUv(uv) {
    const r = uv && typeof uv === 'object' ? uv : null;
    if (!r) return '-';
    return `${formatFloat(r.u0)},${formatFloat(r.v0)},${formatFloat(r.u1)},${formatFloat(r.v1)}`;
}

export class InspectorRoomUI {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'ui-hud-root inspector-room-hud';
        this.root.id = 'inspector-room-hud';

        this.panel = document.createElement('div');
        this.panel.className = 'ui-panel is-interactive inspector-room-panel';

        this.title = document.createElement('div');
        this.title.className = 'ui-title';
        this.title.textContent = 'Inspector Room';

        const makeRow = (label, { wide = false } = {}) => {
            const row = document.createElement('div');
            row.className = wide ? 'inspector-room-row inspector-room-row-wide' : 'inspector-room-row';
            const lab = document.createElement('div');
            lab.className = 'inspector-room-row-label';
            lab.textContent = label;
            const body = document.createElement('div');
            body.className = 'inspector-room-row-body';
            row.appendChild(lab);
            row.appendChild(body);
            return { row, lab, body };
        };

        const modeRow = makeRow('Mode');
        this.modeSelect = document.createElement('select');
        this.modeSelect.className = 'inspector-room-select';
        for (const opt of MODE_OPTIONS) {
            const o = document.createElement('option');
            o.value = opt.id;
            o.textContent = opt.label;
            this.modeSelect.appendChild(o);
        }
        modeRow.body.appendChild(this.modeSelect);

        this.catalogLabel = document.createElement('div');
        this.catalogLabel.className = 'ui-section-label';
        this.catalogLabel.textContent = 'Catalog';

        const collectionRow = makeRow('Collection');
        this.collectionSelect = document.createElement('select');
        this.collectionSelect.className = 'inspector-room-select';
        collectionRow.body.appendChild(this.collectionSelect);

        const itemRow = makeRow('Item');
        this.itemControls = document.createElement('div');
        this.itemControls.className = 'inspector-room-item-controls';

        this.prevBtn = document.createElement('button');
        this.prevBtn.type = 'button';
        this.prevBtn.className = 'inspector-room-btn inspector-room-btn-icon';
        applyMaterialSymbolToButton(this.prevBtn, { name: 'chevron_left', label: 'Previous item', size: 'md' });

        this.nextBtn = document.createElement('button');
        this.nextBtn.type = 'button';
        this.nextBtn.className = 'inspector-room-btn inspector-room-btn-icon';
        applyMaterialSymbolToButton(this.nextBtn, { name: 'chevron_right', label: 'Next item', size: 'md' });

        this.itemSelect = document.createElement('select');
        this.itemSelect.className = 'inspector-room-select';

        this.itemControls.appendChild(this.prevBtn);
        this.itemControls.appendChild(this.itemSelect);
        this.itemControls.appendChild(this.nextBtn);
        itemRow.body.appendChild(this.itemControls);

        const idRow = makeRow('Id');
        this.itemIdValue = document.createElement('div');
        this.itemIdValue.className = 'inspector-room-row-value';
        this.itemIdValue.textContent = '-';
        idRow.body.appendChild(this.itemIdValue);

        const nameRow = makeRow('Name', { wide: true });
        this.itemNameValue = document.createElement('div');
        this.itemNameValue.className = 'inspector-room-row-value';
        this.itemNameValue.textContent = '-';
        nameRow.body.appendChild(this.itemNameValue);

        this.modeSeparator = document.createElement('div');
        this.modeSeparator.className = 'ui-separator';

        this.meshSection = document.createElement('div');
        this.meshSection.className = 'inspector-room-mode inspector-room-mode-meshes';

        this.textureSection = document.createElement('div');
        this.textureSection.className = 'inspector-room-mode inspector-room-mode-textures';

        this._buildMeshControls();
        this._buildTextureControls();

        this.panel.appendChild(this.title);
        this.panel.appendChild(modeRow.row);
        this.panel.appendChild(this.catalogLabel);
        this.panel.appendChild(collectionRow.row);
        this.panel.appendChild(itemRow.row);
        this.panel.appendChild(idRow.row);
        this.panel.appendChild(nameRow.row);
        this.panel.appendChild(this.modeSeparator);
        this.panel.appendChild(this.meshSection);
        this.panel.appendChild(this.textureSection);

        this.root.appendChild(this.panel);

        this._lightRange = 10;
        this._light = { x: 4, z: 4, y: 7 };
        this._lightYMaxAbs = 25;
        this._lightYExponent = 3;
        this._lightEnabled = true;
        this._lightIntensity = 1.2;
        this._lightColorHex = 0xffffff;
        const colorState = lightHexIntToHueTone(this._lightColorHex, { fallbackHueDegrees: 0 });
        this._lightColorHueDegrees = colorState.hueDegrees;
        this._lightColorTone = colorState.tone;
        this._lightMapBasis = { rightX: 1, rightZ: 0, forwardX: 0, forwardZ: 1 };

        this._buildAxisLegend();
        this._buildCameraPresets();
        this._buildLightingPanel();
        this._buildViewportOverlay();

        this.onModeChange = null;
        this.onCollectionChange = null;
        this.onItemChange = null;
        this.onItemPrev = null;
        this.onItemNext = null;

        this.onWireframeChange = null;
        this.onEdgesChange = null;
        this.onPivotChange = null;
        this.onColorModeChange = null;

        this.onBaseColorChange = null;
        this.onPreviewModeChange = null;
        this.onTextureSizeChange = null;
        this.onTileGapChange = null;
        this.onWindowPbrChange = null;

        this.onAxisLabelsToggle = null;
        this.onAxisLinesToggle = null;
        this.onAxisAlwaysVisibleToggle = null;
        this.onGridToggle = null;
        this.onPlaneToggle = null;
        this.onMeasurementsToggle = null;

        this.onLightChange = null;
        this.onLightMarkerToggle = null;
        this.onLightEnabledToggle = null;
        this.onLightIntensityChange = null;
        this.onLightColorChange = null;

        this.onCameraPreset = null;

        this._bound = false;
        this._selectedExtra = null;

        this._axisLabelsEnabled = true;
        this._axisLinesEnabled = true;
        this._axesAlwaysVisible = false;
        this._gridEnabled = true;
        this._planeEnabled = true;
        this._measurementsEnabled = false;
        this._lightMarkerEnabled = false;

        this._onMode = () => this.onModeChange?.(this.modeSelect.value);
        this._onCollection = () => this.onCollectionChange?.(this.collectionSelect.value);
        this._onItem = () => this.onItemChange?.(this.itemSelect.value);
        this._onPrev = () => this.onItemPrev?.();
        this._onNext = () => this.onItemNext?.();

        this._onWireframe = () => this.onWireframeChange?.(this.wireframeInput.checked);
        this._onEdges = () => this.onEdgesChange?.(this.edgesInput.checked);
        this._onPivot = () => this.onPivotChange?.(this.pivotInput.checked);
        this._onColorMode = () => this.onColorModeChange?.(this.colorModeSelect.value);

        this._onBaseColor = () => this.onBaseColorChange?.(this.baseColorSelect.value);
        this._onPreviewMode = () => {
            this._syncTexturePreviewWidgets();
            this.onPreviewModeChange?.(this.getPreviewModeId());
        };
        this._onTextureSize = () => {
            this.onTextureSizeChange?.(this.getTextureRealWorldSizeMeters());
            this._syncTextureSummary();
        };
        this._onTileGapRange = () => this._setTileGapFromUi(this.tileGapRange.value);
        this._onTileGapNumber = () => this._setTileGapFromUi(this.tileGapNumber.value);

        this._onWindowPbrToggle = () => {
            this._syncWindowPbrWidgets();
            this.onWindowPbrChange?.(this.getWindowPbrConfig());
        };
        this._onWindowNormalStrengthRange = () => {
            const next = clamp(this.windowNormalStrengthRange.value, 0, 2);
            this.windowNormalStrengthRange.value = String(next);
            this.windowNormalStrengthNumber.value = formatFloat(next, 2);
            this._onWindowPbrToggle();
        };
        this._onWindowNormalStrengthNumber = () => {
            const next = clamp(this.windowNormalStrengthNumber.value, 0, 2);
            this.windowNormalStrengthRange.value = String(next);
            this.windowNormalStrengthNumber.value = formatFloat(next, 2);
            this._onWindowPbrToggle();
        };
        this._onWindowRoughnessContrastRange = () => {
            const next = clamp(this.windowRoughnessContrastRange.value, 0, 4);
            this.windowRoughnessContrastRange.value = String(next);
            this.windowRoughnessContrastNumber.value = formatFloat(next, 2);
            this._onWindowPbrToggle();
        };
        this._onWindowRoughnessContrastNumber = () => {
            const next = clamp(this.windowRoughnessContrastNumber.value, 0, 4);
            this.windowRoughnessContrastRange.value = String(next);
            this.windowRoughnessContrastNumber.value = formatFloat(next, 2);
            this._onWindowPbrToggle();
        };
        this._onWindowBorderThicknessRange = () => {
            const next = clamp(this.windowBorderThicknessRange.value, 0, 0.12);
            this.windowBorderThicknessRange.value = String(next);
            this.windowBorderThicknessNumber.value = formatFloat(next, 3);
            this._onWindowPbrToggle();
        };
        this._onWindowBorderThicknessNumber = () => {
            const next = clamp(this.windowBorderThicknessNumber.value, 0, 0.12);
            this.windowBorderThicknessRange.value = String(next);
            this.windowBorderThicknessNumber.value = formatFloat(next, 3);
            this._onWindowPbrToggle();
        };
        this._onWindowBorderStrengthRange = () => {
            const next = clamp(this.windowBorderStrengthRange.value, 0, 1);
            this.windowBorderStrengthRange.value = String(next);
            this.windowBorderStrengthNumber.value = formatFloat(next, 2);
            this._onWindowPbrToggle();
        };
        this._onWindowBorderStrengthNumber = () => {
            const next = clamp(this.windowBorderStrengthNumber.value, 0, 1);
            this.windowBorderStrengthRange.value = String(next);
            this.windowBorderStrengthNumber.value = formatFloat(next, 2);
            this._onWindowPbrToggle();
        };

        this._onLabelsToggle = () => {
            this._axisLabelsEnabled = !this._axisLabelsEnabled;
            this._syncAxisLegendState();
            this.onAxisLabelsToggle?.(this._axisLabelsEnabled);
        };
        this._onAxisLinesToggle = () => {
            this._axisLinesEnabled = !this._axisLinesEnabled;
            this._syncAxisLegendState();
            this.onAxisLinesToggle?.(this._axisLinesEnabled);
        };
        this._onAxisAlwaysToggle = () => {
            this._axesAlwaysVisible = !this._axesAlwaysVisible;
            this._syncAxisLegendState();
            this.onAxisAlwaysVisibleToggle?.(this._axesAlwaysVisible);
        };
        this._onGridToggle = () => {
            this._gridEnabled = !this._gridEnabled;
            this._syncAxisLegendState();
            this.onGridToggle?.(this._gridEnabled);
        };
        this._onPlaneToggle = () => {
            this._planeEnabled = !this._planeEnabled;
            this._syncAxisLegendState();
            this.onPlaneToggle?.(this._planeEnabled);
        };
        this._onMeasurementsToggle = () => {
            this._measurementsEnabled = !this._measurementsEnabled;
            this._syncAxisLegendState();
            this.onMeasurementsToggle?.(this._measurementsEnabled);
        };

        this._onLightMarker = () => {
            this._lightMarkerEnabled = !this._lightMarkerEnabled;
            this._syncLightingWidgets();
            this.onLightMarkerToggle?.(this._lightMarkerEnabled);
        };

        this._onLightEnabled = () => {
            this._lightEnabled = !this._lightEnabled;
            this._syncLightingWidgets();
            this.onLightEnabledToggle?.(this._lightEnabled);
            this._syncLightMarkerUi();
        };

        this._onLightSlider = () => {
            const t = clamp(Number(this.lightY.value), 0, 1);
            this._light.y = lightBiasedSignedExpSliderToValue(t, { maxAbs: this._lightYMaxAbs, exponent: this._lightYExponent, zeroAt: 0.25 });
            this.onLightChange?.({ ...this._light });
            this._syncLightingWidgets();
            this._syncLightMarkerUi();
        };

        this._onLightIntensity = () => {
            const next = clamp(Number(this.lightIntensity.value), 0, 4);
            this._lightIntensity = next;
            this._syncLightingWidgets();
            this.onLightIntensityChange?.(next);
            this._syncLightMarkerUi();
        };

        const syncLightColorFromSliders = () => {
            const next = lightHueToneToHexInt(this._lightColorHueDegrees, this._lightColorTone);
            this._lightColorHex = next;
            this._syncLightingWidgets();
            this.onLightColorChange?.(next);
            this._syncLightMarkerUi();
        };

        this._onLightHue = () => {
            this._lightColorHueDegrees = clamp(Number(this.lightHue.value), 0, 360);
            syncLightColorFromSliders();
        };

        this._onLightTone = () => {
            this._lightColorTone = -clamp(Number(this.lightTone.value), -1, 1);
            syncLightColorFromSliders();
        };

        this._onCameraFree = () => this.onCameraPreset?.('free');
        this._onCameraFront = () => this.onCameraPreset?.('front');
        this._onCameraBack = () => this.onCameraPreset?.('back');
        this._onCameraRight = () => this.onCameraPreset?.('right');
        this._onCameraLeft = () => this.onCameraPreset?.('left');
        this._onCameraTop = () => this.onCameraPreset?.('top');
        this._onCameraBottom = () => this.onCameraPreset?.('bottom');

        this._onCopyMesh = () => this._copyMeshSummary();
        this._onCopyTexture = () => this._copyTextureSummary();

        this._syncModeVisibility();
        this._syncAxisLegendState();
        this._syncTexturePreviewWidgets();
        this._syncLightingWidgets();
        this._syncLightMarkerUi();
    }

    mount() {
        if (!this.root.isConnected) document.body.appendChild(this.root);
        this._bind();
    }

    unmount() {
        this._unbind();
        this.root.remove();
    }

    setMode(modeId) {
        const next = modeId === 'textures' ? 'textures' : 'meshes';
        this.modeSelect.value = next;
        this._syncModeVisibility();
    }

    getMode() {
        return this.modeSelect.value === 'textures' ? 'textures' : 'meshes';
    }

    setCollectionOptions(options) {
        const list = Array.isArray(options) ? options : [];
        const current = this.collectionSelect.value;
        this.collectionSelect.textContent = '';
        for (const opt of list) {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            if (!id) continue;
            const label = typeof opt?.label === 'string' ? opt.label : (typeof opt?.name === 'string' ? opt.name : id);
            const el = document.createElement('option');
            el.value = id;
            el.textContent = label;
            this.collectionSelect.appendChild(el);
        }
        if (current) this.collectionSelect.value = current;
    }

    setSelectedCollectionId(id) {
        const next = typeof id === 'string' ? id : '';
        if (next) this.collectionSelect.value = next;
    }

    setItemOptions(options) {
        const list = Array.isArray(options) ? options : [];
        const current = this.itemSelect.value;
        this.itemSelect.textContent = '';
        for (const opt of list) {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            if (!id) continue;
            const label = typeof opt?.label === 'string' ? opt.label : (typeof opt?.name === 'string' ? opt.name : id);
            const el = document.createElement('option');
            el.value = id;
            el.textContent = `${label} (${id})`;
            this.itemSelect.appendChild(el);
        }
        if (current) this.itemSelect.value = current;
    }

    setSelectedItemId(id) {
        const next = typeof id === 'string' ? id : '';
        if (next) this.itemSelect.value = next;
    }

    setSelectedItemMeta({ id = '-', name = '-', collection = null, extra = null } = {}) {
        this.itemIdValue.textContent = id || '-';
        const mode = this.getMode();
        if (mode === 'textures') {
            const safeCollection = typeof collection === 'string' ? collection : '';
            this.itemNameValue.textContent = safeCollection ? `${name || '-'} (${safeCollection})` : (name || '-');
            this._selectedExtra = extra;
            this._syncTextureSummary();
            this._syncWindowPbrVisibility();
        } else {
            this.itemNameValue.textContent = name || '-';
        }
    }

    setWireframeEnabled(enabled) {
        this.wireframeInput.checked = !!enabled;
    }

    setEdgesEnabled(enabled) {
        this.edgesInput.checked = !!enabled;
    }

    setPivotEnabled(enabled) {
        this.pivotInput.checked = !!enabled;
    }

    setColorMode(mode) {
        this.colorModeSelect.value = mode === 'solid' ? 'solid' : 'semantic';
    }

    setPrefabParams(api) {
        const valid = !!api && typeof api === 'object'
            && !!api.schema && typeof api.getParam === 'function' && typeof api.setParam === 'function';
        this._prefabApi = valid ? api : null;
        this.prefabPanel.textContent = '';

        if (!this._prefabApi) {
            this.prefabLabel.classList.add('hidden');
            this.prefabPanel.classList.add('hidden');
            return;
        }

        this.prefabLabel.classList.remove('hidden');
        this.prefabPanel.classList.remove('hidden');

        this._renderSchemaControls(this.prefabPanel, this._prefabApi, {
            getValue: (id) => this._prefabApi.getParam(id),
            setValue: (id, value) => this._prefabApi.setParam(id, value),
            collapsible: false
        });
    }

    setRig(api) {
        const valid = !!api && typeof api === 'object'
            && !!api.schema && typeof api.getValue === 'function' && typeof api.setValue === 'function';
        this._rigApi = valid ? api : null;
        this.rigPanel.textContent = '';

        if (!this._rigApi) {
            this.rigLabel.classList.add('hidden');
            this.rigPanel.classList.add('hidden');
            return;
        }

        this.rigLabel.classList.remove('hidden');
        this.rigPanel.classList.remove('hidden');

        const renderGroup = (groupApi, { title = null, isChild = false } = {}) => {
            this._renderSchemaControls(this.rigPanel, groupApi, {
                title,
                isChild,
                getValue: (id) => groupApi.getValue(id),
                setValue: (id, value) => groupApi.setValue(id, value),
                collapsible: isChild
            });

            const children = Array.isArray(groupApi?.children) ? groupApi.children : [];
            for (const child of children) {
                const childLabel = child?.schema?.label ?? child?.schema?.id ?? 'Child';
                renderGroup(child, { title: childLabel, isChild: true });
            }
        };

        renderGroup(this._rigApi);
    }

    setHoverInfo(info) {
        this.hoverValue.textContent = info ? this._formatMeshInfo(info) : '-';
    }

    setSelectedInfo(info) {
        this.selectedValue.textContent = info ? this._formatMeshInfo(info) : '-';
        this._syncMeshSummary(info);
    }

    setBaseColorId(id) {
        const next = INSPECTOR_ROOM_BASE_COLORS.find((c) => c.id === id)?.id ?? INSPECTOR_ROOM_BASE_COLORS[0]?.id ?? 'white';
        this.baseColorSelect.value = next;
        this._syncTextureSummary();
    }

    getBaseColorHex() {
        const id = this.baseColorSelect.value;
        return INSPECTOR_ROOM_BASE_COLORS.find((c) => c.id === id)?.hex ?? 0xffffff;
    }

    setPreviewModeId(modeId) {
        const next = modeId === 'tiled' ? 'tiled' : 'single';
        this.tiledInput.checked = next === 'tiled';
        this._syncTexturePreviewWidgets();
        this._syncTextureSummary();
    }

    getPreviewModeId() {
        return this.tiledInput.checked ? 'tiled' : 'single';
    }

    setTextureRealWorldSizeMeters({ widthMeters, heightMeters } = {}) {
        const w = Number(widthMeters);
        const h = Number(heightMeters);
        if (Number.isFinite(w) && w > 0) this.textureWidthMeters.value = String(w);
        if (Number.isFinite(h) && h > 0) this.textureHeightMeters.value = String(h);
        this._syncTextureSummary();
    }

    getTextureRealWorldSizeMeters() {
        const w = Number(this.textureWidthMeters.value);
        const h = Number(this.textureHeightMeters.value);
        return {
            widthMeters: (Number.isFinite(w) && w > 0) ? w : null,
            heightMeters: (Number.isFinite(h) && h > 0) ? h : null
        };
    }

    setTileGap(value) {
        const num = Number(value);
        const next = Number.isFinite(num) ? Math.max(0, Math.min(0.75, num)) : 0;
        const text = String(next);
        this.tileGapRange.value = text;
        this.tileGapNumber.value = text;
    }

    setWindowPbrConfig(config) {
        const src = config && typeof config === 'object' ? config : {};
        const normal = src.normal && typeof src.normal === 'object' ? src.normal : {};
        const roughness = src.roughness && typeof src.roughness === 'object' ? src.roughness : {};
        const border = src.border && typeof src.border === 'object' ? src.border : {};

        const normalEnabled = normal.enabled === undefined ? true : !!normal.enabled;
        const normalStrength = clamp(normal.strength ?? 0.85, 0, 2);
        const roughEnabled = roughness.enabled === undefined ? true : !!roughness.enabled;
        const roughContrast = clamp(roughness.contrast ?? 1.0, 0, 4);
        const borderEnabled = border.enabled === undefined ? true : !!border.enabled;
        const borderThickness = clamp(border.thickness ?? 0.018, 0, 0.12);
        const borderStrength = clamp(border.strength ?? 0.35, 0, 1);

        this.windowNormalEnabled.checked = normalEnabled;
        this.windowNormalStrengthRange.value = String(normalStrength);
        this.windowNormalStrengthNumber.value = formatFloat(normalStrength, 2);

        this.windowRoughnessEnabled.checked = roughEnabled;
        this.windowRoughnessContrastRange.value = String(roughContrast);
        this.windowRoughnessContrastNumber.value = formatFloat(roughContrast, 2);

        this.windowBorderEnabled.checked = borderEnabled;
        this.windowBorderThicknessRange.value = String(borderThickness);
        this.windowBorderThicknessNumber.value = formatFloat(borderThickness, 3);
        this.windowBorderStrengthRange.value = String(borderStrength);
        this.windowBorderStrengthNumber.value = formatFloat(borderStrength, 2);

        this._syncWindowPbrWidgets();
    }

    getWindowPbrConfig() {
        const normalEnabled = !!this.windowNormalEnabled.checked;
        const normalStrength = clamp(this.windowNormalStrengthRange.value, 0, 2);
        const roughEnabled = !!this.windowRoughnessEnabled.checked;
        const roughContrast = clamp(this.windowRoughnessContrastRange.value, 0, 4);
        const borderEnabled = !!this.windowBorderEnabled.checked;
        const borderThickness = clamp(this.windowBorderThicknessRange.value, 0, 0.12);
        const borderStrength = clamp(this.windowBorderStrengthRange.value, 0, 1);

        return {
            normal: {
                enabled: normalEnabled,
                strength: normalStrength
            },
            roughness: {
                enabled: roughEnabled,
                contrast: roughContrast
            },
            border: {
                enabled: borderEnabled,
                thickness: borderThickness,
                strength: borderStrength
            }
        };
    }

    setAxisLegendState({ labelsEnabled, axisLinesEnabled, axesAlwaysVisible, gridEnabled, planeEnabled, measurementsEnabled } = {}) {
        if (labelsEnabled !== undefined) this._axisLabelsEnabled = !!labelsEnabled;
        if (axisLinesEnabled !== undefined) this._axisLinesEnabled = !!axisLinesEnabled;
        if (axesAlwaysVisible !== undefined) this._axesAlwaysVisible = !!axesAlwaysVisible;
        if (gridEnabled !== undefined) this._gridEnabled = !!gridEnabled;
        if (planeEnabled !== undefined) this._planeEnabled = !!planeEnabled;
        if (measurementsEnabled !== undefined) this._measurementsEnabled = !!measurementsEnabled;
        this._syncAxisLegendState();
    }

    getAxisLegendState() {
        return {
            labelsEnabled: this._axisLabelsEnabled,
            axisLinesEnabled: this._axisLinesEnabled,
            axesAlwaysVisible: this._axesAlwaysVisible,
            gridEnabled: this._gridEnabled,
            planeEnabled: this._planeEnabled,
            measurementsEnabled: this._measurementsEnabled
        };
    }

    setLightState({ x, z, y, markerEnabled, enabled, intensity, colorHex, colorHueDegrees, colorTone, range } = {}) {
        if (Number.isFinite(Number(range)) && range > 0) this._lightRange = Number(range);
        if (Number.isFinite(Number(x))) this._light.x = Number(x);
        if (Number.isFinite(Number(z))) this._light.z = Number(z);
        if (Number.isFinite(Number(y))) this._light.y = Number(y);
        if (markerEnabled !== undefined) this._lightMarkerEnabled = !!markerEnabled;
        if (enabled !== undefined) this._lightEnabled = !!enabled;
        if (Number.isFinite(Number(intensity))) this._lightIntensity = clamp(intensity, 0, 4);

        const hasHueUpdate = Number.isFinite(Number(colorHueDegrees));
        const hasToneUpdate = Number.isFinite(Number(colorTone));
        if (hasHueUpdate) this._lightColorHueDegrees = clamp(colorHueDegrees, 0, 360);
        if (hasToneUpdate) this._lightColorTone = clamp(colorTone, -1, 1);

        const sliderHex = lightHueToneToHexInt(this._lightColorHueDegrees, this._lightColorTone);

        if (Number.isFinite(Number(colorHex))) {
            const nextHex = Number(colorHex);
            if (nextHex !== this._lightColorHex && nextHex !== sliderHex) {
                const nextState = lightHexIntToHueTone(nextHex, { fallbackHueDegrees: this._lightColorHueDegrees });
                this._lightColorHueDegrees = nextState.hueDegrees;
                this._lightColorTone = nextState.tone;
            }
            this._lightColorHex = nextHex;
        } else if (hasHueUpdate || hasToneUpdate) {
            this._lightColorHex = sliderHex;
        }

        this.lightY.value = String(lightBiasedSignedExpValueToSlider(this._light.y, { maxAbs: this._lightYMaxAbs, exponent: this._lightYExponent, zeroAt: 0.25 }));
        this.lightIntensity.value = String(clamp(this._lightIntensity, 0, 4));
        this.lightHue.value = String(clamp(this._lightColorHueDegrees, 0, 360));
        this.lightTone.value = String(-clamp(this._lightColorTone, -1, 1));
        this._syncLightingWidgets();
        this._syncLightMarkerUi();
    }

    getLightState() {
        return {
            ...this._light,
            range: this._lightRange,
            markerEnabled: this._lightMarkerEnabled,
            enabled: this._lightEnabled,
            intensity: this._lightIntensity,
            colorHex: this._lightColorHex,
            colorHueDegrees: this._lightColorHueDegrees,
            colorTone: this._lightColorTone
        };
    }

    setLightMapBasis({ rightX, rightZ, forwardX, forwardZ } = {}) {
        const rx = Number(rightX);
        const rz = Number(rightZ);
        const fx = Number(forwardX);
        const fz = Number(forwardZ);
        if (!(Number.isFinite(rx) && Number.isFinite(rz) && Number.isFinite(fx) && Number.isFinite(fz))) return;

        const fLen = Math.hypot(fx, fz);
        if (!(fLen > 1e-6)) return;
        const nfx = fx / fLen;
        const nfz = fz / fLen;

        let nrx = nfz;
        let nrz = -nfx;
        const rLen = Math.hypot(rx, rz);
        if (rLen > 1e-6) {
            const crx = rx / rLen;
            const crz = rz / rLen;
            if (crx * nrx + crz * nrz < 0) {
                nrx *= -1;
                nrz *= -1;
            }
        }

        this._lightMapBasis = { rightX: nrx, rightZ: nrz, forwardX: nfx, forwardZ: nfz };
        this._syncLightMarkerUi();
    }

    _buildMeshControls() {
        this.viewLabel = document.createElement('div');
        this.viewLabel.className = 'ui-section-label';
        this.viewLabel.textContent = 'Mesh';

        const makeToggle = (label) => {
            const row = document.createElement('label');
            row.className = 'inspector-room-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            const text = document.createElement('span');
            text.textContent = label;
            row.appendChild(input);
            row.appendChild(text);
            return { row, input };
        };

        const wire = makeToggle('Wireframe');
        this.wireframeToggle = wire.row;
        this.wireframeInput = wire.input;

        const edges = makeToggle('Edges');
        this.edgesToggle = edges.row;
        this.edgesInput = edges.input;

        const pivot = makeToggle('Pivot');
        this.pivotToggle = pivot.row;
        this.pivotInput = pivot.input;

        const colorRow = document.createElement('div');
        colorRow.className = 'inspector-room-row';
        const colorLab = document.createElement('div');
        colorLab.className = 'inspector-room-row-label';
        colorLab.textContent = 'Colors';
        const colorBody = document.createElement('div');
        colorBody.className = 'inspector-room-row-body';
        this.colorModeSelect = document.createElement('select');
        this.colorModeSelect.className = 'inspector-room-select';
        const semantic = document.createElement('option');
        semantic.value = 'semantic';
        semantic.textContent = 'Semantic';
        const solid = document.createElement('option');
        solid.value = 'solid';
        solid.textContent = 'Solid';
        this.colorModeSelect.appendChild(semantic);
        this.colorModeSelect.appendChild(solid);
        colorBody.appendChild(this.colorModeSelect);
        colorRow.appendChild(colorLab);
        colorRow.appendChild(colorBody);

        this.prefabLabel = document.createElement('div');
        this.prefabLabel.className = 'ui-section-label';
        this.prefabLabel.textContent = 'Construction / Prefab Params';

        this.prefabPanel = document.createElement('div');
        this.prefabPanel.className = 'inspector-room-controls';

        this.rigLabel = document.createElement('div');
        this.rigLabel.className = 'ui-section-label';
        this.rigLabel.textContent = 'Runtime / Rig Controls';

        this.rigPanel = document.createElement('div');
        this.rigPanel.className = 'inspector-room-controls';

        this.selectionLabel = document.createElement('div');
        this.selectionLabel.className = 'ui-section-label';
        this.selectionLabel.textContent = 'Selection';

        const hoverRow = document.createElement('div');
        hoverRow.className = 'inspector-room-row inspector-room-row-wide';
        const hoverLab = document.createElement('div');
        hoverLab.className = 'inspector-room-row-label';
        hoverLab.textContent = 'Hover';
        this.hoverValue = document.createElement('div');
        this.hoverValue.className = 'inspector-room-row-value';
        this.hoverValue.textContent = '-';
        hoverRow.appendChild(hoverLab);
        hoverRow.appendChild(this.hoverValue);

        const selRow = document.createElement('div');
        selRow.className = 'inspector-room-row inspector-room-row-wide';
        const selLab = document.createElement('div');
        selLab.className = 'inspector-room-row-label';
        selLab.textContent = 'Selected';
        this.selectedValue = document.createElement('div');
        this.selectedValue.className = 'inspector-room-row-value';
        this.selectedValue.textContent = '-';
        selRow.appendChild(selLab);
        selRow.appendChild(this.selectedValue);

        this.meshSummary = document.createElement('textarea');
        this.meshSummary.className = 'inspector-room-summary';
        this.meshSummary.rows = 3;
        this.meshSummary.readOnly = true;
        this.meshSummary.value = '';

        this.meshCopyBtn = document.createElement('button');
        this.meshCopyBtn.type = 'button';
        this.meshCopyBtn.className = 'inspector-room-btn inspector-room-btn-primary';
        this.meshCopyBtn.textContent = 'Copy selection';

        this.meshSection.appendChild(this.viewLabel);
        this.meshSection.appendChild(this.wireframeToggle);
        this.meshSection.appendChild(this.edgesToggle);
        this.meshSection.appendChild(this.pivotToggle);
        this.meshSection.appendChild(colorRow);
        this.meshSection.appendChild(this.prefabLabel);
        this.meshSection.appendChild(this.prefabPanel);
        this.meshSection.appendChild(this.rigLabel);
        this.meshSection.appendChild(this.rigPanel);
        this.meshSection.appendChild(this.selectionLabel);
        this.meshSection.appendChild(hoverRow);
        this.meshSection.appendChild(selRow);
        this.meshSection.appendChild(this.meshSummary);
        this.meshSection.appendChild(this.meshCopyBtn);

        this._prefabApi = null;
        this._rigApi = null;
    }

    _buildTextureControls() {
        this.textureLabel = document.createElement('div');
        this.textureLabel.className = 'ui-section-label';
        this.textureLabel.textContent = 'Texture';

        const baseRow = document.createElement('div');
        baseRow.className = 'inspector-room-row';
        const baseLab = document.createElement('div');
        baseLab.className = 'inspector-room-row-label';
        baseLab.textContent = 'Base';
        const baseBody = document.createElement('div');
        baseBody.className = 'inspector-room-row-body';
        this.baseColorSelect = document.createElement('select');
        this.baseColorSelect.className = 'inspector-room-select';
        for (const opt of INSPECTOR_ROOM_BASE_COLORS) {
            const o = document.createElement('option');
            o.value = opt.id;
            o.textContent = opt.label;
            this.baseColorSelect.appendChild(o);
        }
        baseBody.appendChild(this.baseColorSelect);
        baseRow.appendChild(baseLab);
        baseRow.appendChild(baseBody);

        const modeRow = document.createElement('div');
        modeRow.className = 'inspector-room-row';
        const modeLab = document.createElement('div');
        modeLab.className = 'inspector-room-row-label';
        modeLab.textContent = 'Preview';
        const modeBody = document.createElement('div');
        modeBody.className = 'inspector-room-row-body';
        this.tiledToggle = document.createElement('label');
        this.tiledToggle.className = 'inspector-room-toggle inspector-room-toggle-inline';
        this.tiledInput = document.createElement('input');
        this.tiledInput.type = 'checkbox';
        const tiledText = document.createElement('span');
        tiledText.textContent = 'Tiled';
        this.tiledToggle.appendChild(this.tiledInput);
        this.tiledToggle.appendChild(tiledText);
        modeBody.appendChild(this.tiledToggle);
        modeRow.appendChild(modeLab);
        modeRow.appendChild(modeBody);

        const sizeRow = document.createElement('div');
        sizeRow.className = 'inspector-room-row';
        const sizeLab = document.createElement('div');
        sizeLab.className = 'inspector-room-row-label';
        sizeLab.textContent = 'Size (m)';
        const sizeBody = document.createElement('div');
        sizeBody.className = 'inspector-room-row-body';
        this.textureSizeControls = document.createElement('div');
        this.textureSizeControls.className = 'inspector-room-dim-controls';
        this.textureWidthMeters = document.createElement('input');
        this.textureWidthMeters.type = 'number';
        this.textureWidthMeters.className = 'inspector-room-number';
        this.textureWidthMeters.min = '0.01';
        this.textureWidthMeters.step = '0.01';
        this.textureWidthMeters.value = '2';
        const dimSep = document.createElement('div');
        dimSep.className = 'inspector-room-dim-sep';
        dimSep.textContent = '×';
        this.textureHeightMeters = document.createElement('input');
        this.textureHeightMeters.type = 'number';
        this.textureHeightMeters.className = 'inspector-room-number';
        this.textureHeightMeters.min = '0.01';
        this.textureHeightMeters.step = '0.01';
        this.textureHeightMeters.value = '2';
        this.textureSizeControls.appendChild(this.textureWidthMeters);
        this.textureSizeControls.appendChild(dimSep);
        this.textureSizeControls.appendChild(this.textureHeightMeters);
        sizeBody.appendChild(this.textureSizeControls);
        sizeRow.appendChild(sizeLab);
        sizeRow.appendChild(sizeBody);
        this.textureSizeRow = sizeRow;

        const gapRow = document.createElement('div');
        gapRow.className = 'inspector-room-row';
        const gapLab = document.createElement('div');
        gapLab.className = 'inspector-room-row-label';
        gapLab.textContent = 'Gap';
        this.tileGapControls = document.createElement('div');
        this.tileGapControls.className = 'inspector-room-gap-controls';
        this.tileGapRange = document.createElement('input');
        this.tileGapRange.type = 'range';
        this.tileGapRange.className = 'inspector-room-range';
        this.tileGapRange.min = '0';
        this.tileGapRange.max = '0.75';
        this.tileGapRange.step = '0.01';
        this.tileGapRange.value = '0';
        this.tileGapNumber = document.createElement('input');
        this.tileGapNumber.type = 'number';
        this.tileGapNumber.className = 'inspector-room-number';
        this.tileGapNumber.min = '0';
        this.tileGapNumber.max = '0.75';
        this.tileGapNumber.step = '0.01';
        this.tileGapNumber.value = '0';
        this.tileGapControls.appendChild(this.tileGapRange);
        this.tileGapControls.appendChild(this.tileGapNumber);
        gapRow.appendChild(gapLab);
        gapRow.appendChild(this.tileGapControls);
        this.tileGapRow = gapRow;

        this.windowPbrSection = document.createElement('div');
        this.windowPbrSection.className = 'hidden';

        this.windowPbrLabel = document.createElement('div');
        this.windowPbrLabel.className = 'ui-section-label';
        this.windowPbrLabel.textContent = 'Window PBR';
        this.windowPbrSection.appendChild(this.windowPbrLabel);

        const makeToggleRow = (labelText, toggleText) => {
            const row = document.createElement('div');
            row.className = 'inspector-room-row';
            const lab = document.createElement('div');
            lab.className = 'inspector-room-row-label';
            lab.textContent = labelText;
            const body = document.createElement('div');
            body.className = 'inspector-room-row-body';
            const toggle = document.createElement('label');
            toggle.className = 'inspector-room-toggle inspector-room-toggle-inline';
            const input = document.createElement('input');
            input.type = 'checkbox';
            const text = document.createElement('span');
            text.textContent = toggleText;
            toggle.appendChild(input);
            toggle.appendChild(text);
            body.appendChild(toggle);
            row.appendChild(lab);
            row.appendChild(body);
            return { row, input };
        };

        const makeRangeRow = (labelText, { min, max, step, value, digits = 2 } = {}) => {
            const row = document.createElement('div');
            row.className = 'inspector-room-row';
            const lab = document.createElement('div');
            lab.className = 'inspector-room-row-label';
            lab.textContent = labelText;
            const controls = document.createElement('div');
            controls.className = 'inspector-room-gap-controls';
            const range = document.createElement('input');
            range.type = 'range';
            range.className = 'inspector-room-range';
            range.min = String(min ?? 0);
            range.max = String(max ?? 1);
            range.step = String(step ?? 0.01);
            range.value = String(value ?? 0);
            const number = document.createElement('input');
            number.type = 'number';
            number.className = 'inspector-room-number';
            number.min = range.min;
            number.max = range.max;
            number.step = range.step;
            number.value = formatFloat(value ?? 0, digits);
            controls.appendChild(range);
            controls.appendChild(number);
            row.appendChild(lab);
            row.appendChild(controls);
            return { row, range, number };
        };

        const winNormalToggle = makeToggleRow('Normals', 'Enabled');
        this.windowNormalEnabled = winNormalToggle.input;
        this.windowNormalEnabled.checked = true;
        this.windowPbrSection.appendChild(winNormalToggle.row);

        const winNormalStrength = makeRangeRow('Normal intensity', { min: 0, max: 2, step: 0.01, value: 0.85, digits: 2 });
        this.windowNormalStrengthRange = winNormalStrength.range;
        this.windowNormalStrengthNumber = winNormalStrength.number;
        this.windowPbrSection.appendChild(winNormalStrength.row);

        const winRoughToggle = makeToggleRow('Roughness', 'Enabled');
        this.windowRoughnessEnabled = winRoughToggle.input;
        this.windowRoughnessEnabled.checked = true;
        this.windowPbrSection.appendChild(winRoughToggle.row);

        const winRoughContrast = makeRangeRow('Roughness contrast', { min: 0, max: 4, step: 0.05, value: 1.0, digits: 2 });
        this.windowRoughnessContrastRange = winRoughContrast.range;
        this.windowRoughnessContrastNumber = winRoughContrast.number;
        this.windowPbrSection.appendChild(winRoughContrast.row);

        const winBorderToggle = makeToggleRow('Border lip', 'Enabled');
        this.windowBorderEnabled = winBorderToggle.input;
        this.windowBorderEnabled.checked = true;
        this.windowPbrSection.appendChild(winBorderToggle.row);

        const winBorderThickness = makeRangeRow('Lip width', { min: 0, max: 0.12, step: 0.001, value: 0.018, digits: 3 });
        this.windowBorderThicknessRange = winBorderThickness.range;
        this.windowBorderThicknessNumber = winBorderThickness.number;
        this.windowPbrSection.appendChild(winBorderThickness.row);

        const winBorderStrength = makeRangeRow('Lip depth', { min: 0, max: 1, step: 0.01, value: 0.35, digits: 2 });
        this.windowBorderStrengthRange = winBorderStrength.range;
        this.windowBorderStrengthNumber = winBorderStrength.number;
        this.windowPbrSection.appendChild(winBorderStrength.row);

        this.textureSummary = document.createElement('textarea');
        this.textureSummary.className = 'inspector-room-summary';
        this.textureSummary.rows = 2;
        this.textureSummary.readOnly = true;
        this.textureSummary.value = '';

        this.textureCopyBtn = document.createElement('button');
        this.textureCopyBtn.type = 'button';
        this.textureCopyBtn.className = 'inspector-room-btn inspector-room-btn-primary';
        this.textureCopyBtn.textContent = 'Copy';

        this.textureSection.appendChild(this.textureLabel);
        this.textureSection.appendChild(baseRow);
        this.textureSection.appendChild(modeRow);
        this.textureSection.appendChild(sizeRow);
        this.textureSection.appendChild(gapRow);
        this.textureSection.appendChild(this.windowPbrSection);
        this.textureSection.appendChild(this.textureSummary);
        this.textureSection.appendChild(this.textureCopyBtn);
    }

    _buildAxisLegend() {
        this.axisLegend = document.createElement('div');
        this.axisLegend.className = 'inspector-room-axis-legend';

        this.axisKey = document.createElement('div');
        this.axisKey.className = 'inspector-room-axis-key';

        const makeKey = (text, cls) => {
            const el = document.createElement('span');
            el.className = `inspector-room-axis-key-item ${cls}`;
            el.textContent = text;
            return el;
        };

        this.axisKey.appendChild(makeKey('X', 'is-x'));
        this.axisKey.appendChild(makeKey('Y', 'is-y'));
        this.axisKey.appendChild(makeKey('Z', 'is-z'));

        this.axisActions = document.createElement('div');
        this.axisActions.className = 'inspector-room-axis-actions';

        this.labelsBtn = document.createElement('button');
        this.labelsBtn.type = 'button';
        this.labelsBtn.className = 'inspector-room-mini-btn';
        applyMaterialSymbolToButton(this.labelsBtn, { name: 'label', label: 'Toggle labels', size: 'sm' });

        this.axisLinesBtn = document.createElement('button');
        this.axisLinesBtn.type = 'button';
        this.axisLinesBtn.className = 'inspector-room-mini-btn';
        applyMaterialSymbolToButton(this.axisLinesBtn, { name: 'timeline', label: 'Toggle axis lines', size: 'sm' });

        this.axisAlwaysBtn = document.createElement('button');
        this.axisAlwaysBtn.type = 'button';
        this.axisAlwaysBtn.className = 'inspector-room-mini-btn';
        applyMaterialSymbolToButton(this.axisAlwaysBtn, { name: 'visibility_lock', label: 'Always visible axis lines', size: 'sm' });

        this.axisSep = document.createElement('span');
        this.axisSep.className = 'inspector-room-axis-sep';
        this.axisSep.textContent = '|';

        this.gridBtn = document.createElement('button');
        this.gridBtn.type = 'button';
        this.gridBtn.className = 'inspector-room-mini-btn';
        applyMaterialSymbolToButton(this.gridBtn, { name: 'grid_on', label: 'Toggle grid', size: 'sm' });

        this.planeBtn = document.createElement('button');
        this.planeBtn.type = 'button';
        this.planeBtn.className = 'inspector-room-mini-btn';
        applyMaterialSymbolToButton(this.planeBtn, { name: 'layers', label: 'Toggle plane material', size: 'sm' });

        this.measureBtn = document.createElement('button');
        this.measureBtn.type = 'button';
        this.measureBtn.className = 'inspector-room-mini-btn';
        applyMaterialSymbolToButton(this.measureBtn, { name: 'straighten', label: 'Toggle measurements', size: 'sm' });

        this.axisActions.appendChild(this.labelsBtn);
        this.axisActions.appendChild(this.axisLinesBtn);
        this.axisActions.appendChild(this.axisAlwaysBtn);
        this.axisActions.appendChild(this.axisSep);
        this.axisActions.appendChild(this.gridBtn);
        this.axisActions.appendChild(this.planeBtn);
        this.axisActions.appendChild(this.measureBtn);

        this.axisLegend.appendChild(this.axisKey);
        this.axisLegend.appendChild(this.axisActions);
        this.root.appendChild(this.axisLegend);
    }

    _buildViewportOverlay() {
        this.viewportOverlay = document.createElement('div');
        this.viewportOverlay.className = 'inspector-room-viewport-overlay';

        const makeLabel = (text, cls) => {
            const el = document.createElement('div');
            el.className = `inspector-room-viewport-label ${cls}`;
            el.textContent = text;
            el.style.display = 'none';
            this.viewportOverlay.appendChild(el);
            return el;
        };

        this.viewportAxisLabels = {
            xn: makeLabel('-X', 'inspector-room-viewport-axis is-x'),
            xp: makeLabel('+X', 'inspector-room-viewport-axis is-x'),
            yn: makeLabel('-Y', 'inspector-room-viewport-axis is-y'),
            yp: makeLabel('+Y', 'inspector-room-viewport-axis is-y'),
            zn: makeLabel('-Z', 'inspector-room-viewport-axis is-z'),
            zp: makeLabel('+Z', 'inspector-room-viewport-axis is-z')
        };

        this.viewportMeasureLabels = {
            x: makeLabel('0m', 'inspector-room-viewport-measure'),
            y: makeLabel('0m', 'inspector-room-viewport-measure'),
            z: makeLabel('0m', 'inspector-room-viewport-measure')
        };

        this.root.appendChild(this.viewportOverlay);
    }

    setViewportAxisLabelPositions(positions = null) {
        const enabled = !!this._axisLabelsEnabled;
        const list = positions && typeof positions === 'object' ? positions : null;
        const labels = this.viewportAxisLabels ?? {};

        for (const key of Object.keys(labels)) {
            const el = labels[key];
            if (!el) continue;
            const pos = enabled ? (list?.[key] ?? null) : null;
            const x = Number(pos?.x);
            const y = Number(pos?.y);
            const visible = !!pos?.visible && Number.isFinite(x) && Number.isFinite(y);
            if (!visible) {
                el.style.display = 'none';
                continue;
            }
            el.style.display = 'block';
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
        }
    }

    setViewportMeasurementLabelPositions(positions = null) {
        const enabled = !!this._measurementsEnabled;
        const list = positions && typeof positions === 'object' ? positions : null;
        const labels = this.viewportMeasureLabels ?? {};

        for (const key of Object.keys(labels)) {
            const el = labels[key];
            if (!el) continue;
            const pos = enabled ? (list?.[key] ?? null) : null;
            const x = Number(pos?.x);
            const y = Number(pos?.y);
            const text = typeof pos?.text === 'string' ? pos.text : '';
            const visible = !!pos?.visible && Number.isFinite(x) && Number.isFinite(y) && !!text;
            if (!visible) {
                el.style.display = 'none';
                continue;
            }
            el.textContent = text;
            el.style.display = 'block';
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
        }
    }

    _buildCameraPresets() {
        this.cameraPanel = document.createElement('div');
        this.cameraPanel.className = 'inspector-room-camera-panel';

        const mk = (icon, label) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'inspector-room-mini-btn';
            applyMaterialSymbolToButton(b, { name: icon, label, size: 'sm' });
            return b;
        };

        this.cameraFreeBtn = mk('3d_rotation', 'Free');
        this.cameraFrontBtn = mk('north', 'Front');
        this.cameraBackBtn = mk('south', 'Back');
        this.cameraRightBtn = mk('east', 'Right');
        this.cameraLeftBtn = mk('west', 'Left');
        this.cameraTopBtn = mk('vertical_align_top', 'Top');
        this.cameraBottomBtn = mk('vertical_align_bottom', 'Bottom');

        this.cameraPanel.appendChild(this.cameraFreeBtn);
        this.cameraPanel.appendChild(this.cameraFrontBtn);
        this.cameraPanel.appendChild(this.cameraBackBtn);
        this.cameraPanel.appendChild(this.cameraRightBtn);
        this.cameraPanel.appendChild(this.cameraLeftBtn);
        this.cameraPanel.appendChild(this.cameraTopBtn);
        this.cameraPanel.appendChild(this.cameraBottomBtn);

        this.root.appendChild(this.cameraPanel);
    }

    _buildLightingPanel() {
        this.lightingPanel = document.createElement('div');
        this.lightingPanel.className = 'inspector-room-lighting-panel';

        this.lightingTitle = document.createElement('div');
        this.lightingTitle.className = 'inspector-room-lighting-title';
        this.lightingTitle.textContent = 'Light';

        this.lightMarkerBtn = document.createElement('button');
        this.lightMarkerBtn.type = 'button';
        this.lightMarkerBtn.className = 'inspector-room-mini-btn inspector-room-light-marker-btn';
        applyMaterialSymbolToButton(this.lightMarkerBtn, { name: 'lightbulb', label: 'Toggle bulb visualization', size: 'sm' });

        this.lightEnabledBtn = document.createElement('button');
        this.lightEnabledBtn.type = 'button';
        this.lightEnabledBtn.className = 'inspector-room-mini-btn inspector-room-light-enabled-btn';
        applyMaterialSymbolToButton(this.lightEnabledBtn, { name: 'light_mode', label: 'Toggle light contribution', size: 'sm' });

        const actions = document.createElement('div');
        actions.className = 'inspector-room-lighting-actions';
        actions.appendChild(this.lightEnabledBtn);
        actions.appendChild(this.lightMarkerBtn);

        const header = document.createElement('div');
        header.className = 'inspector-room-lighting-header';
        header.appendChild(this.lightingTitle);
        header.appendChild(actions);

        this.lightMap = document.createElement('div');
        this.lightMap.className = 'inspector-room-light-map';
        this.lightMap.tabIndex = 0;

        this.lightMapMarker = document.createElement('div');
        this.lightMapMarker.className = 'inspector-room-light-map-marker';
        this.lightMap.appendChild(this.lightMapMarker);

        this.lightYWrap = document.createElement('div');
        this.lightYWrap.className = 'inspector-room-light-y';

        this.lightY = document.createElement('input');
        this.lightY.type = 'range';
        this.lightY.className = 'inspector-room-light-y-slider';
        this.lightY.min = '0';
        this.lightY.max = '1';
        this.lightY.step = '0.001';
        this.lightY.value = String(lightBiasedSignedExpValueToSlider(this._light.y, { maxAbs: this._lightYMaxAbs, exponent: this._lightYExponent, zeroAt: 0.25 }));
        this.lightY.setAttribute('aria-label', 'Light height (Y)');

        this.lightYWrap.appendChild(this.lightY);

        const body = document.createElement('div');
        body.className = 'inspector-room-lighting-body';
        body.appendChild(this.lightMap);
        body.appendChild(this.lightYWrap);

        this.lightExtras = document.createElement('div');
        this.lightExtras.className = 'inspector-room-lighting-extras';

        this.lightIntensityRow = document.createElement('div');
        this.lightIntensityRow.className = 'inspector-room-light-row';
        this.lightIntensityLabel = document.createElement('div');
        this.lightIntensityLabel.className = 'inspector-room-light-row-label';
        this.lightIntensityLabel.textContent = 'Brightness';
        this.lightIntensity = document.createElement('input');
        this.lightIntensity.type = 'range';
        this.lightIntensity.className = 'inspector-room-light-row-slider';
        this.lightIntensity.min = '0';
        this.lightIntensity.max = '4';
        this.lightIntensity.step = '0.01';
        this.lightIntensity.value = String(this._lightIntensity);
        this.lightIntensityValue = document.createElement('div');
        this.lightIntensityValue.className = 'inspector-room-light-row-value';
        this.lightIntensityValue.textContent = '';
        this.lightIntensityRow.appendChild(this.lightIntensityLabel);
        this.lightIntensityRow.appendChild(this.lightIntensity);
        this.lightIntensityRow.appendChild(this.lightIntensityValue);

        this.lightHueRow = document.createElement('div');
        this.lightHueRow.className = 'inspector-room-light-row';
        this.lightHueLabel = document.createElement('div');
        this.lightHueLabel.className = 'inspector-room-light-row-label';
        this.lightHueLabel.textContent = 'Color';
        this.lightHue = document.createElement('input');
        this.lightHue.type = 'range';
        this.lightHue.className = 'inspector-room-light-row-slider inspector-room-light-hue-slider';
        this.lightHue.min = '0';
        this.lightHue.max = '360';
        this.lightHue.step = '1';
        this.lightHue.value = String(clamp(this._lightColorHueDegrees, 0, 360));
        this.lightHueValue = document.createElement('div');
        this.lightHueValue.className = 'inspector-room-light-row-value';
        this.lightHueValue.textContent = '';
        this.lightHueRow.appendChild(this.lightHueLabel);
        this.lightHueRow.appendChild(this.lightHue);
        this.lightHueRow.appendChild(this.lightHueValue);

        this.lightToneRow = document.createElement('div');
        this.lightToneRow.className = 'inspector-room-light-row';
        this.lightToneLabel = document.createElement('div');
        this.lightToneLabel.className = 'inspector-room-light-row-label';
        this.lightToneLabel.textContent = 'White/Black';
        this.lightTone = document.createElement('input');
        this.lightTone.type = 'range';
        this.lightTone.className = 'inspector-room-light-row-slider inspector-room-light-tone-slider';
        this.lightTone.min = '-1';
        this.lightTone.max = '1';
        this.lightTone.step = '0.01';
        this.lightTone.value = String(-clamp(this._lightColorTone, -1, 1));
        this.lightToneValue = document.createElement('div');
        this.lightToneValue.className = 'inspector-room-light-row-value';
        this.lightToneValue.textContent = '';
        this.lightToneRow.appendChild(this.lightToneLabel);
        this.lightToneRow.appendChild(this.lightTone);
        this.lightToneRow.appendChild(this.lightToneValue);

        this.lightExtras.appendChild(this.lightIntensityRow);
        this.lightExtras.appendChild(this.lightHueRow);
        this.lightExtras.appendChild(this.lightToneRow);

        this.lightingPanel.appendChild(header);
        this.lightingPanel.appendChild(body);
        this.lightingPanel.appendChild(this.lightExtras);
        this.root.appendChild(this.lightingPanel);

        this._lightMapDragging = false;
        this._lightPointerId = null;
        this._onLightMapDown = (e) => this._handleLightMapDown(e);
        this._onLightMapMove = (e) => this._handleLightMapMove(e);
        this._onLightMapUp = (e) => this._handleLightMapUp(e);
    }

    _syncModeVisibility() {
        const mode = this.getMode();
        this.meshSection.classList.toggle('hidden', mode !== 'meshes');
        this.textureSection.classList.toggle('hidden', mode !== 'textures');
        if (mode !== 'textures') this._selectedExtra = null;
        this._syncWindowPbrVisibility();
    }

    _renderSchemaControls(panel, groupApi, { title = null, isChild = false, getValue, setValue, collapsible = false } = {}) {
        const schema = groupApi?.schema ?? null;
        if (!schema) return;

        const container = document.createElement('div');
        container.className = isChild ? 'inspector-room-controls-group' : 'inspector-room-controls-root';

        const body = document.createElement('div');
        body.className = 'inspector-room-controls-group-body';

        if (title) {
            const heading = document.createElement('button');
            heading.type = 'button';
            heading.className = 'inspector-room-controls-group-title';

            const caret = document.createElement('span');
            caret.className = 'inspector-room-controls-group-caret';
            caret.textContent = collapsible ? '▾' : '';

            const text = document.createElement('span');
            text.textContent = title;

            heading.appendChild(caret);
            heading.appendChild(text);
            container.appendChild(heading);

            if (collapsible) {
                heading.classList.add('is-collapsible');
                heading.addEventListener('click', () => {
                    const nextCollapsed = !container.classList.contains('is-collapsed');
                    container.classList.toggle('is-collapsed', nextCollapsed);
                    caret.textContent = nextCollapsed ? '▸' : '▾';
                });
            }
        }

        const props = Array.isArray(schema.properties) ? schema.properties : [];
        for (const prop of props) {
            const propId = typeof prop?.id === 'string' ? prop.id : '';
            if (!propId) continue;

            const row = document.createElement('div');
            row.className = 'inspector-room-control-row';

            const label = document.createElement('div');
            label.className = 'inspector-room-control-row-label';
            label.textContent = prop?.label ?? propId;

            const control = document.createElement('div');
            control.className = 'inspector-room-control-row-control';

            if (prop?.type === 'enum') {
                const select = document.createElement('select');
                select.className = 'inspector-room-select';
                const options = Array.isArray(prop?.options) ? prop.options : [];
                for (const opt of options) {
                    const id = typeof opt?.id === 'string' ? opt.id : '';
                    if (!id) continue;
                    const o = document.createElement('option');
                    o.value = id;
                    o.textContent = opt?.label ?? id;
                    select.appendChild(o);
                }
                select.value = String(getValue(propId) ?? prop.defaultValue ?? select.value);
                select.addEventListener('change', () => {
                    setValue(propId, select.value);
                    select.value = getValue(propId) ?? select.value;
                });
                control.appendChild(select);
            } else if (prop?.type === 'number') {
                const wrap = document.createElement('div');
                wrap.className = 'inspector-room-control-number';

                const slider = document.createElement('input');
                slider.type = 'range';
                slider.min = String(Number(prop?.min ?? 0));
                slider.max = String(Number(prop?.max ?? 1));
                slider.step = String(Number(prop?.step ?? 0.01));
                slider.value = String(getValue(propId) ?? prop.defaultValue ?? 0);
                slider.className = 'inspector-room-control-number-slider';

                const value = document.createElement('div');
                value.className = 'inspector-room-control-number-value';
                value.textContent = slider.value;

                const sync = () => {
                    setValue(propId, slider.value);
                    const next = getValue(propId) ?? slider.value;
                    slider.value = String(next);
                    value.textContent = String(next);
                };

                slider.addEventListener('input', sync);
                slider.addEventListener('change', sync);

                wrap.appendChild(slider);
                wrap.appendChild(value);
                control.appendChild(wrap);
            } else if (prop?.type === 'boolean') {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = !!(getValue(propId) ?? prop.defaultValue ?? false);
                checkbox.addEventListener('change', () => {
                    setValue(propId, checkbox.checked);
                    checkbox.checked = !!(getValue(propId) ?? checkbox.checked);
                });
                control.appendChild(checkbox);
            }

            row.appendChild(label);
            row.appendChild(control);
            body.appendChild(row);
        }

        container.appendChild(body);
        panel.appendChild(container);
    }

    _formatMeshInfo(info) {
        const regionId = info?.regionId ?? '-';
        const tag = info?.tag ? ` • ${info.tag}` : '';
        return `${regionId}${tag}`;
    }

    _syncMeshSummary(info) {
        if (!info) {
            this.meshSummary.value = '';
            return;
        }
        const src = info?.sourceType
            ? ` src:${info.sourceType}${Number.isFinite(info?.sourceVersion) ? `@${info.sourceVersion}` : ''}`
            : '';
        const triangle = Number.isFinite(info.triangle) ? ` tri:${info.triangle}` : '';
        this.meshSummary.value = `mesh:${info.meshId}${src} region:${info.regionId} tag:${info.tag}${triangle}`;
    }

    _copyMeshSummary() {
        const text = this.meshSummary.value || '';
        if (!text) return;
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => this._fallbackCopy(this.meshSummary, text));
            return;
        }
        this._fallbackCopy(this.meshSummary, text);
    }

    _syncTextureSummary() {
        const collectionId = this.collectionSelect.value || '-';
        const textureId = this.itemSelect.value || '-';
        const base = this.baseColorSelect.value || 'white';
        const preview = this.getPreviewModeId();
        const size = this.getTextureRealWorldSizeMeters();
        const extra = this._selectedExtra;

        const parts = [`collection:${collectionId}`, `texture:${textureId}`, `base:${base}`, `preview:${preview}`];
        const atlas = typeof extra?.atlas === 'string' ? extra.atlas : '';
        if (atlas) parts.push(`atlas:${atlas}`);
        if (extra?.rectPx) parts.push(`rect:${formatRectPx(extra.rectPx)}`);
        if (extra?.uv) parts.push(`uv:${formatUv(extra.uv)}`);
        if (typeof extra?.style === 'string' && extra.style) parts.push(`style:${extra.style}`);

        const widthMeters = Number(size?.widthMeters);
        const heightMeters = Number(size?.heightMeters);
        if (Number.isFinite(widthMeters) && widthMeters > 0 && Number.isFinite(heightMeters) && heightMeters > 0) {
            parts.push(`size:${formatFloat(widthMeters, 2)}x${formatFloat(heightMeters, 2)}m`);
        }

        const tileMeters = Number(extra?.tileMeters);
        if (Number.isFinite(tileMeters) && tileMeters > 0) parts.push(`tile:${formatFloat(tileMeters, 2)}m`);
        const variant = typeof extra?.preferredVariant === 'string' ? extra.preferredVariant : '';
        if (variant) parts.push(`variant:${variant}`);
        const variants = Array.isArray(extra?.variants) ? extra.variants.filter((v) => typeof v === 'string' && v) : null;
        if (variants?.length) parts.push(`variants:${variants.join(',')}`);
        const maps = Array.isArray(extra?.maps) ? extra.maps.filter((m) => typeof m === 'string' && m) : null;
        if (maps?.length) parts.push(`maps:${maps.join(',')}`);
        if (maps?.length && extra?.resolvedMaps && typeof extra.resolvedMaps === 'object') {
            const resolved = maps.filter((m) => !!extra.resolvedMaps[m]);
            if (resolved.length !== maps.length) parts.push(`resolved:${resolved.length ? resolved.join(',') : 'none'}`);
        }
        this.textureSummary.value = parts.join(' ');
    }

    _copyTextureSummary() {
        const text = this.textureSummary.value || '';
        if (!text) return;
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => this._fallbackCopy(this.textureSummary, text));
            return;
        }
        this._fallbackCopy(this.textureSummary, text);
    }

    _fallbackCopy(textarea, text) {
        const el = textarea && typeof textarea === 'object' ? textarea : null;
        if (!el) return;
        el.focus();
        el.select();
        try {
            document.execCommand('copy');
        } catch {
            // ignore
        }
        el.setSelectionRange(text.length, text.length);
    }

    _setTileGapFromUi(raw) {
        const num = Number(raw);
        const next = Number.isFinite(num) ? Math.max(0, Math.min(0.75, num)) : 0;
        this.setTileGap(next);
        this.onTileGapChange?.(next);
    }

    _syncTexturePreviewWidgets() {
        const tiled = this.getPreviewModeId() === 'tiled';
        if (this.tileGapRow) this.tileGapRow.classList.toggle('hidden', !tiled);
    }

    _syncWindowPbrVisibility() {
        const visible = this.getMode() === 'textures' && this._selectedExtra?.kind === 'window';
        if (this.windowPbrSection) this.windowPbrSection.classList.toggle('hidden', !visible);
    }

    _syncWindowPbrWidgets() {
        const normalEnabled = !!this.windowNormalEnabled.checked;
        const roughEnabled = !!this.windowRoughnessEnabled.checked;
        const borderEnabled = !!this.windowBorderEnabled.checked;

        this.windowNormalStrengthRange.disabled = !normalEnabled;
        this.windowNormalStrengthNumber.disabled = !normalEnabled;

        this.windowRoughnessContrastRange.disabled = !roughEnabled;
        this.windowRoughnessContrastNumber.disabled = !roughEnabled;

        this.windowBorderEnabled.disabled = !normalEnabled;
        this.windowBorderThicknessRange.disabled = !normalEnabled || !borderEnabled;
        this.windowBorderThicknessNumber.disabled = this.windowBorderThicknessRange.disabled;
        this.windowBorderStrengthRange.disabled = !normalEnabled || !borderEnabled;
        this.windowBorderStrengthNumber.disabled = this.windowBorderStrengthRange.disabled;
    }

    _syncAxisLegendState() {
        this.axisLegend.classList.toggle('labels-off', !this._axisLabelsEnabled);
        this.axisLegend.classList.toggle('lines-off', !this._axisLinesEnabled);
        this.axisLegend.classList.toggle('always-on', !!this._axesAlwaysVisible);
        this.axisLegend.classList.toggle('grid-off', !this._gridEnabled);
        this.axisLegend.classList.toggle('plane-off', !this._planeEnabled);
        this.axisLegend.classList.toggle('measure-on', !!this._measurementsEnabled);
    }

    _syncLightingWidgets() {
        this.lightingPanel.classList.toggle('marker-on', !!this._lightMarkerEnabled);
        this.lightingPanel.classList.toggle('light-off', !this._lightEnabled);

        if (this.lightMarkerBtn) this.lightMarkerBtn.classList.toggle('is-active', !!this._lightMarkerEnabled);
        if (this.lightEnabledBtn) this.lightEnabledBtn.classList.toggle('is-active', !!this._lightEnabled);

        if (this.lightIntensityValue) {
            this.lightIntensityValue.textContent = `${clamp(this._lightIntensity, 0, 4).toFixed(2)}×`;
        }

        if (this.lightHueValue) {
            this.lightHueValue.textContent = `${Math.round(clamp(this._lightColorHueDegrees, 0, 360))}°`;
        }

        if (this.lightToneValue) {
            const hex = Number(this._lightColorHex);
            const safe = Number.isFinite(hex) ? hex : 0xffffff;
            this.lightToneValue.textContent = `#${safe.toString(16).padStart(6, '0')}`;
        }
    }

    _syncLightMarkerUi() {
        const map = this.lightMap ?? null;
        const marker = this.lightMapMarker ?? null;
        if (!map || !marker) return;
        const r = Math.max(0.001, Number(this._lightRange) || 10);
        const basis = this._lightMapBasis ?? { rightX: 1, rightZ: 0, forwardX: 0, forwardZ: 1 };
        const lx = Number(this._light.x) || 0;
        const lz = Number(this._light.z) || 0;
        const nx = clamp((lx * (Number(basis.rightX) || 0) + lz * (Number(basis.rightZ) || 0)) / r, -1, 1);
        const nz = clamp((lx * (Number(basis.forwardX) || 0) + lz * (Number(basis.forwardZ) || 0)) / r, -1, 1);
        const x = (nx * 0.5 + 0.5) * 100;
        const y = (-(nz) * 0.5 + 0.5) * 100;
        marker.style.left = `${x}%`;
        marker.style.top = `${y}%`;
        marker.style.display = 'block';

        const hex = Number(this._lightColorHex);
        const safe = Number.isFinite(hex) ? hex : 0xffffff;
        const rr = (safe >> 16) & 0xff;
        const gg = (safe >> 8) & 0xff;
        const bb = safe & 0xff;
        const intensity = clamp(this._lightIntensity, 0, 4);
        const intensityNorm = clamp(intensity / 4, 0, 1);
        const alpha = this._lightEnabled ? (0.22 + 0.78 * intensityNorm) : 0.12;
        marker.style.background = `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
        marker.style.borderColor = this._lightEnabled ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
        marker.style.boxShadow = `0 0 ${Math.round(10 + 16 * intensityNorm)}px rgba(${rr}, ${gg}, ${bb}, ${0.25 * intensityNorm})`;
    }

    _handleLightMapDown(e) {
        if (!e) return;
        e.preventDefault();
        e.stopPropagation?.();
        this._lightMapDragging = true;
        this._lightPointerId = e.pointerId ?? null;
        try {
            if (this.lightMap?.isConnected && typeof e.pointerId === 'number') {
                this.lightMap.setPointerCapture(e.pointerId);
            }
        } catch {
            // ignore
        }
        this._setLightFromPointerEvent(e);
    }

    _handleLightMapMove(e) {
        if (!this._lightMapDragging) return;
        if (this._lightPointerId !== null && e.pointerId !== this._lightPointerId) return;
        e.preventDefault();
        e.stopPropagation?.();
        this._setLightFromPointerEvent(e);
    }

    _handleLightMapUp(e) {
        if (!this._lightMapDragging) return;
        if (this._lightPointerId !== null && e.pointerId !== this._lightPointerId) return;
        e.preventDefault();
        e.stopPropagation?.();
        this._lightMapDragging = false;
        this._lightPointerId = null;
        try {
            if (this.lightMap?.isConnected && typeof e.pointerId === 'number') {
                this.lightMap.releasePointerCapture(e.pointerId);
            }
        } catch {
            // ignore
        }
    }

    _setLightFromPointerEvent(e) {
        const map = this.lightMap ?? null;
        if (!map) return;
        const rect = map.getBoundingClientRect();
        const px = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        const py = clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
        const nx = px * 2 - 1;
        const nz = -(py * 2 - 1);
        const r = Math.max(0.001, Number(this._lightRange) || 10);
        const basis = this._lightMapBasis ?? { rightX: 1, rightZ: 0, forwardX: 0, forwardZ: 1 };
        const rx = Number(basis.rightX) || 0;
        const rz = Number(basis.rightZ) || 0;
        const fx = Number(basis.forwardX) || 0;
        const fz = Number(basis.forwardZ) || 0;
        this._light.x = (rx * nx + fx * nz) * r;
        this._light.z = (rz * nx + fz * nz) * r;
        this.onLightChange?.({ ...this._light });
        this._syncLightMarkerUi();
    }

    _bind() {
        if (this._bound) return;
        this._bound = true;

        this.modeSelect.addEventListener('change', this._onMode);
        this.collectionSelect.addEventListener('change', this._onCollection);
        this.itemSelect.addEventListener('change', this._onItem);
        this.prevBtn.addEventListener('click', this._onPrev);
        this.nextBtn.addEventListener('click', this._onNext);

        this.wireframeInput.addEventListener('change', this._onWireframe);
        this.edgesInput.addEventListener('change', this._onEdges);
        this.pivotInput.addEventListener('change', this._onPivot);
        this.colorModeSelect.addEventListener('change', this._onColorMode);

        this.baseColorSelect.addEventListener('change', this._onBaseColor);
        this.tiledInput.addEventListener('change', this._onPreviewMode);
        this.textureWidthMeters.addEventListener('change', this._onTextureSize);
        this.textureHeightMeters.addEventListener('change', this._onTextureSize);
        this.tileGapRange.addEventListener('input', this._onTileGapRange);
        this.tileGapNumber.addEventListener('change', this._onTileGapNumber);

        this.windowNormalEnabled.addEventListener('change', this._onWindowPbrToggle);
        this.windowNormalStrengthRange.addEventListener('input', this._onWindowNormalStrengthRange);
        this.windowNormalStrengthNumber.addEventListener('change', this._onWindowNormalStrengthNumber);
        this.windowRoughnessEnabled.addEventListener('change', this._onWindowPbrToggle);
        this.windowRoughnessContrastRange.addEventListener('input', this._onWindowRoughnessContrastRange);
        this.windowRoughnessContrastNumber.addEventListener('change', this._onWindowRoughnessContrastNumber);
        this.windowBorderEnabled.addEventListener('change', this._onWindowPbrToggle);
        this.windowBorderThicknessRange.addEventListener('input', this._onWindowBorderThicknessRange);
        this.windowBorderThicknessNumber.addEventListener('change', this._onWindowBorderThicknessNumber);
        this.windowBorderStrengthRange.addEventListener('input', this._onWindowBorderStrengthRange);
        this.windowBorderStrengthNumber.addEventListener('change', this._onWindowBorderStrengthNumber);

        this.labelsBtn.addEventListener('click', this._onLabelsToggle);
        this.axisLinesBtn.addEventListener('click', this._onAxisLinesToggle);
        this.axisAlwaysBtn.addEventListener('click', this._onAxisAlwaysToggle);
        this.gridBtn.addEventListener('click', this._onGridToggle);
        this.planeBtn.addEventListener('click', this._onPlaneToggle);
        this.measureBtn.addEventListener('click', this._onMeasurementsToggle);

        this.lightMarkerBtn.addEventListener('click', this._onLightMarker);
        this.lightEnabledBtn.addEventListener('click', this._onLightEnabled);
        this.lightY.addEventListener('input', this._onLightSlider);
        this.lightIntensity.addEventListener('input', this._onLightIntensity);
        this.lightHue.addEventListener('input', this._onLightHue);
        this.lightTone.addEventListener('input', this._onLightTone);
        this.lightMap.addEventListener('pointerdown', this._onLightMapDown, { passive: false });
        this.lightMap.addEventListener('pointermove', this._onLightMapMove, { passive: false });
        this.lightMap.addEventListener('pointerup', this._onLightMapUp, { passive: false });
        this.lightMap.addEventListener('pointercancel', this._onLightMapUp, { passive: false });
        this.lightMap.addEventListener('pointerleave', this._onLightMapUp, { passive: false });

        this.cameraFreeBtn.addEventListener('click', this._onCameraFree);
        this.cameraFrontBtn.addEventListener('click', this._onCameraFront);
        this.cameraBackBtn.addEventListener('click', this._onCameraBack);
        this.cameraRightBtn.addEventListener('click', this._onCameraRight);
        this.cameraLeftBtn.addEventListener('click', this._onCameraLeft);
        this.cameraTopBtn.addEventListener('click', this._onCameraTop);
        this.cameraBottomBtn.addEventListener('click', this._onCameraBottom);

        this.meshCopyBtn.addEventListener('click', this._onCopyMesh);
        this.textureCopyBtn.addEventListener('click', this._onCopyTexture);
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;

        this.modeSelect.removeEventListener('change', this._onMode);
        this.collectionSelect.removeEventListener('change', this._onCollection);
        this.itemSelect.removeEventListener('change', this._onItem);
        this.prevBtn.removeEventListener('click', this._onPrev);
        this.nextBtn.removeEventListener('click', this._onNext);

        this.wireframeInput.removeEventListener('change', this._onWireframe);
        this.edgesInput.removeEventListener('change', this._onEdges);
        this.pivotInput.removeEventListener('change', this._onPivot);
        this.colorModeSelect.removeEventListener('change', this._onColorMode);

        this.baseColorSelect.removeEventListener('change', this._onBaseColor);
        this.tiledInput.removeEventListener('change', this._onPreviewMode);
        this.textureWidthMeters.removeEventListener('change', this._onTextureSize);
        this.textureHeightMeters.removeEventListener('change', this._onTextureSize);
        this.tileGapRange.removeEventListener('input', this._onTileGapRange);
        this.tileGapNumber.removeEventListener('change', this._onTileGapNumber);

        this.windowNormalEnabled.removeEventListener('change', this._onWindowPbrToggle);
        this.windowNormalStrengthRange.removeEventListener('input', this._onWindowNormalStrengthRange);
        this.windowNormalStrengthNumber.removeEventListener('change', this._onWindowNormalStrengthNumber);
        this.windowRoughnessEnabled.removeEventListener('change', this._onWindowPbrToggle);
        this.windowRoughnessContrastRange.removeEventListener('input', this._onWindowRoughnessContrastRange);
        this.windowRoughnessContrastNumber.removeEventListener('change', this._onWindowRoughnessContrastNumber);
        this.windowBorderEnabled.removeEventListener('change', this._onWindowPbrToggle);
        this.windowBorderThicknessRange.removeEventListener('input', this._onWindowBorderThicknessRange);
        this.windowBorderThicknessNumber.removeEventListener('change', this._onWindowBorderThicknessNumber);
        this.windowBorderStrengthRange.removeEventListener('input', this._onWindowBorderStrengthRange);
        this.windowBorderStrengthNumber.removeEventListener('change', this._onWindowBorderStrengthNumber);

        this.labelsBtn.removeEventListener('click', this._onLabelsToggle);
        this.axisLinesBtn.removeEventListener('click', this._onAxisLinesToggle);
        this.axisAlwaysBtn.removeEventListener('click', this._onAxisAlwaysToggle);
        this.gridBtn.removeEventListener('click', this._onGridToggle);
        this.planeBtn.removeEventListener('click', this._onPlaneToggle);
        this.measureBtn.removeEventListener('click', this._onMeasurementsToggle);

        this.lightMarkerBtn.removeEventListener('click', this._onLightMarker);
        this.lightEnabledBtn.removeEventListener('click', this._onLightEnabled);
        this.lightY.removeEventListener('input', this._onLightSlider);
        this.lightIntensity.removeEventListener('input', this._onLightIntensity);
        this.lightHue.removeEventListener('input', this._onLightHue);
        this.lightTone.removeEventListener('input', this._onLightTone);
        this.lightMap.removeEventListener('pointerdown', this._onLightMapDown);
        this.lightMap.removeEventListener('pointermove', this._onLightMapMove);
        this.lightMap.removeEventListener('pointerup', this._onLightMapUp);
        this.lightMap.removeEventListener('pointercancel', this._onLightMapUp);
        this.lightMap.removeEventListener('pointerleave', this._onLightMapUp);

        this.cameraFreeBtn.removeEventListener('click', this._onCameraFree);
        this.cameraFrontBtn.removeEventListener('click', this._onCameraFront);
        this.cameraBackBtn.removeEventListener('click', this._onCameraBack);
        this.cameraRightBtn.removeEventListener('click', this._onCameraRight);
        this.cameraLeftBtn.removeEventListener('click', this._onCameraLeft);
        this.cameraTopBtn.removeEventListener('click', this._onCameraTop);
        this.cameraBottomBtn.removeEventListener('click', this._onCameraBottom);

        this.meshCopyBtn.removeEventListener('click', this._onCopyMesh);
        this.textureCopyBtn.removeEventListener('click', this._onCopyTexture);
    }
}
