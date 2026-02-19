// src/graphics/gui/material_calibration/MaterialCalibrationUI.js
// Builds the HUD controls for the Material Calibration tool.

import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';
import { getMaterialCalibrationIlluminationPresetById, getMaterialCalibrationIlluminationPresetOptions } from './MaterialCalibrationIlluminationPresets.js';

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function toId(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function setSelectOptions(select, options, { placeholder = null } = {}) {
    const el = select && typeof select === 'object' ? select : null;
    if (!el) return;
    el.textContent = '';

    const ph = typeof placeholder === 'string' ? placeholder : null;
    if (ph) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = ph;
        el.appendChild(opt);
    }

    for (const option of Array.isArray(options) ? options : []) {
        const rawId = option?.id;
        const id = toId(rawId);
        const label = String(option?.label ?? id);
        if (!id && rawId !== '') continue;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label;
        el.appendChild(opt);
    }
}

function parseNumberInput(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return num;
}

function isSelectedMaterial(materialId, slotMaterialIds) {
    const id = toId(materialId);
    if (!id) return false;
    return (Array.isArray(slotMaterialIds) ? slotMaterialIds : []).some((v) => toId(v) === id);
}

function getSlotIndexForMaterialId(materialId, slotMaterialIds) {
    const id = toId(materialId);
    if (!id) return null;
    const list = Array.isArray(slotMaterialIds) ? slotMaterialIds : [];
    const idx = list.findIndex((v) => toId(v) === id);
    return idx >= 0 ? idx : null;
}

const OVERRIDE_CONTROL_DEFS = Object.freeze([
    { type: 'number', id: 'tileMeters', label: 'Tile meters', min: 0.25, max: 16, step: 0.05, digits: 2, bindGroup: 'topLevel', bindKey: 'tileMeters', defaultValue: null },
    { type: 'number', id: 'albedoBrightness', label: 'Albedo bright', min: 0, max: 4, step: 0.01, digits: 2, bindGroup: 'topLevel', bindKey: 'albedoBrightness', defaultValue: 1.0 },
    { type: 'number', id: 'albedoHueDegrees', label: 'Albedo hue°', min: -180, max: 180, step: 1, digits: 0, bindGroup: 'topLevel', bindKey: 'albedoHueDegrees', defaultValue: 0.0 },
    { type: 'number', id: 'albedoTintStrength', label: 'Albedo tint', min: 0, max: 1, step: 0.01, digits: 2, bindGroup: 'topLevel', bindKey: 'albedoTintStrength', defaultValue: 0.0 },
    { type: 'number', id: 'albedoSaturation', label: 'Albedo sat', min: -1, max: 1, step: 0.01, digits: 2, bindGroup: 'topLevel', bindKey: 'albedoSaturation', defaultValue: 0.0 },
    { type: 'number', id: 'roughness', label: 'Roughness mul', min: 0, max: 1, step: 0.01, digits: 2, bindGroup: 'topLevel', bindKey: 'roughness', defaultValue: 1.0 },
    { type: 'number', id: 'roughnessRemapMin', label: 'Rough remap min', min: 0, max: 1, step: 0.01, digits: 2, bindGroup: 'roughnessRemap', bindKey: 'min', defaultValue: 0.0 },
    { type: 'number', id: 'roughnessRemapMax', label: 'Rough remap max', min: 0, max: 1, step: 0.01, digits: 2, bindGroup: 'roughnessRemap', bindKey: 'max', defaultValue: 1.0 },
    { type: 'number', id: 'roughnessRemapGamma', label: 'Rough gamma', min: 0.1, max: 4, step: 0.01, digits: 2, bindGroup: 'roughnessRemap', bindKey: 'gamma', defaultValue: 1.0 },
    { type: 'number', id: 'roughnessRemapLowPercentile', label: 'Rough low %', min: 0, max: 100, step: 1, digits: 0, bindGroup: 'roughnessRemap', bindKey: 'lowPercentile', defaultValue: 0.0 },
    { type: 'number', id: 'roughnessRemapHighPercentile', label: 'Rough high %', min: 0, max: 100, step: 1, digits: 0, bindGroup: 'roughnessRemap', bindKey: 'highPercentile', defaultValue: 100.0 },
    { type: 'switch', id: 'roughnessRemapInvertInput', label: 'Rough invert', bindGroup: 'roughnessRemap', bindKey: 'invertInput', defaultValue: false },
    { type: 'number', id: 'normalStrength', label: 'Normal int', min: 0, max: 8, step: 0.01, digits: 2, bindGroup: 'topLevel', bindKey: 'normalStrength', defaultValue: 1.0 },
    { type: 'number', id: 'aoIntensity', label: 'AO int', min: 0, max: 2, step: 0.01, digits: 2, bindGroup: 'topLevel', bindKey: 'aoIntensity', defaultValue: 1.0 },
    { type: 'number', id: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.01, digits: 2, bindGroup: 'topLevel', bindKey: 'metalness', defaultValue: 0.0 }
]);

function getOverrideControlPropNames(controlId) {
    const id = toId(controlId);
    return {
        range: id ? `${id}Range` : '',
        number: id ? `${id}Number` : ''
    };
}

export class MaterialCalibrationUI {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'ui-hud-root material-calibration-hud';
        this.root.id = 'material-calibration-hud';

        this.leftDock = document.createElement('div');
        this.leftDock.className = 'material-calibration-dock material-calibration-dock-left';

        this.rightDock = document.createElement('div');
        this.rightDock.className = 'material-calibration-dock material-calibration-dock-right';

        this.bottomDock = document.createElement('div');
        this.bottomDock.className = 'ui-panel is-interactive material-calibration-catalog';

        this.centerTools = document.createElement('div');
        this.centerTools.className = 'material-calibration-center-tools';

        this.viewportOverlay = document.createElement('div');
        this.viewportOverlay.className = 'material-calibration-viewport-overlay';

        this.rulerLabel = document.createElement('div');
        this.rulerLabel.className = 'material-calibration-viewport-label material-calibration-ruler-label';
        this.rulerLabel.style.display = 'none';
        this.viewportOverlay.appendChild(this.rulerLabel);
        this._overrideInputs = [];

        this._buildLeftPanels();
        this._buildRightPanel();
        this._buildCatalogPanel();
        this._buildCenterTools();

        this.root.appendChild(this.leftDock);
        this.root.appendChild(this.rightDock);
        this.root.appendChild(this.bottomDock);
        this.root.appendChild(this.centerTools);
        this.root.appendChild(this.viewportOverlay);

        this.onExit = null;
        this.onSelectClass = null;
        this.onToggleMaterial = null;
        this.onFocusMaterial = null;
        this.onFocusSlot = null;
        this.onSetLayoutMode = null;
        this.onSetTilingMode = null;
        this.onSetCalibrationMode = null;
        this.onSelectIlluminationPreset = null;
        this.onSetBaselineMaterial = null;
        this.onSetOverrides = null;
        this.onToggleRuler = null;
        this.onRequestExport = null;
        this.onRequestScreenshot = null;

        this._classOptions = [];
        this._materialOptions = [];
        this._selectedClassId = null;
        this._slotMaterialIds = [null, null, null];
        this._activeSlotIndex = 0;
        this._selectedSlotCameraIndex = null;
        this._baselineMaterialId = null;
        this._activeMaterialId = null;
        this._activeOverrides = null;
        this._calibrationMode = 'calibrated';
        this._rulerEnabled = false;

        this._bound = false;
        this._suppressOverrides = false;

        this._onExitClick = (e) => {
            e.preventDefault();
            this.onExit?.();
        };
        this._onClassChange = () => this.onSelectClass?.(this.classSelect.value);
        this._onCalibrationModeChange = () => this.onSetCalibrationMode?.(this.calibrationModeToggle?.checked ? 'calibrated' : 'raw');
        this._onLayoutChange = () => this.onSetLayoutMode?.(this.layoutSelect.value);
        this._onTilingChange = () => this.onSetTilingMode?.(this.tilingSelect.value);
        this._onIlluminationChange = () => this.onSelectIlluminationPreset?.(this.illuminationSelect.value);
        this._onBaselineChange = () => this.onSetBaselineMaterial?.(this.baselineSelect.value);
        this._onCatalogClick = (e) => this._handleCatalogClick(e);
        this._onCenterToolsClick = (e) => this._handleCenterToolsClick(e);
        this._onOverridesInput = () => this._handleOverridesInput();
        this._onResetOverrides = (e) => {
            e.preventDefault();
            if (!this._activeMaterialId) return;
            this.onSetOverrides?.(this._activeMaterialId, {});
        };
        this._onExportClick = (e) => {
            e.preventDefault();
            this.onRequestExport?.();
        };
        this._onScreenshotClick = (e) => {
            e.preventDefault();
            this.onRequestScreenshot?.();
        };
    }

    mount(parent = document.body) {
        if (this.root.isConnected) return;
        parent.appendChild(this.root);
        this._bind();
    }

    unmount() {
        this._unbind();
        if (this.root.isConnected) this.root.remove();
    }

    _bind() {
        if (this._bound) return;
        this._bound = true;
        for (const binding of this._getUiEventBindings()) {
            const target = binding?.target ?? null;
            const type = binding?.type ?? '';
            const handler = binding?.handler ?? null;
            if (!target || !type || !handler) continue;
            if (binding?.options) target.addEventListener?.(type, handler, binding.options);
            else target.addEventListener?.(type, handler);
        }
        this._setOverrideInputsBindings(true);
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;
        for (const binding of this._getUiEventBindings()) {
            const target = binding?.target ?? null;
            const type = binding?.type ?? '';
            const handler = binding?.handler ?? null;
            if (!target || !type || !handler) continue;
            target.removeEventListener?.(type, handler);
        }
        this._setOverrideInputsBindings(false);
    }

    _getUiEventBindings() {
        return [
            { target: this.exitBtn, type: 'click', handler: this._onExitClick, options: { passive: false } },
            { target: this.classSelect, type: 'change', handler: this._onClassChange },
            { target: this.calibrationModeToggle, type: 'change', handler: this._onCalibrationModeChange },
            { target: this.layoutSelect, type: 'change', handler: this._onLayoutChange },
            { target: this.tilingSelect, type: 'change', handler: this._onTilingChange },
            { target: this.illuminationSelect, type: 'change', handler: this._onIlluminationChange },
            { target: this.baselineSelect, type: 'change', handler: this._onBaselineChange },
            { target: this.catalogGrid, type: 'click', handler: this._onCatalogClick },
            { target: this.centerTools, type: 'click', handler: this._onCenterToolsClick },
            { target: this.exportBtn, type: 'click', handler: this._onExportClick, options: { passive: false } },
            { target: this.screenshotBtn, type: 'click', handler: this._onScreenshotClick, options: { passive: false } },
            { target: this.resetOverridesBtn, type: 'click', handler: this._onResetOverrides, options: { passive: false } }
        ];
    }

    _setOverrideInputsBindings(bound) {
        const action = bound ? 'addEventListener' : 'removeEventListener';
        for (const el of this._getOverrideInputs()) {
            el?.[action]?.('input', this._onOverridesInput);
            el?.[action]?.('change', this._onOverridesInput);
        }
    }

    _buildLeftPanels() {
        this.optionsPanel = document.createElement('div');
        this.optionsPanel.className = 'ui-panel is-interactive material-calibration-panel material-calibration-options';

        const optionsTitle = document.createElement('div');
        optionsTitle.className = 'ui-title';
        optionsTitle.textContent = 'Options';

        const modeRow = document.createElement('div');
        modeRow.className = 'material-calibration-row material-calibration-mode-row';
        const modeLabel = document.createElement('div');
        modeLabel.className = 'material-calibration-row-label';
        modeLabel.textContent = 'Texture mode';
        const modeSwitch = document.createElement('div');
        modeSwitch.className = 'material-calibration-mode-switch';

        this.rawModeLabel = document.createElement('span');
        this.rawModeLabel.className = 'material-calibration-mode-label';
        this.rawModeLabel.textContent = 'Raw';

        this.calibratedModeLabel = document.createElement('span');
        this.calibratedModeLabel.className = 'material-calibration-mode-label';
        this.calibratedModeLabel.textContent = 'Calibrated';

        this.calibrationModeToggleWrap = document.createElement('label');
        this.calibrationModeToggleWrap.className = 'material-calibration-switch';

        this.calibrationModeToggle = document.createElement('input');
        this.calibrationModeToggle.type = 'checkbox';
        this.calibrationModeToggle.className = 'material-calibration-switch-input';
        this.calibrationModeToggle.setAttribute('aria-label', 'Toggle between calibrated and raw texture mode');

        this.calibrationModeToggleTrack = document.createElement('span');
        this.calibrationModeToggleTrack.className = 'material-calibration-switch-track';

        this.calibrationModeToggleWrap.appendChild(this.calibrationModeToggle);
        this.calibrationModeToggleWrap.appendChild(this.calibrationModeToggleTrack);
        modeSwitch.appendChild(this.rawModeLabel);
        modeSwitch.appendChild(this.calibrationModeToggleWrap);
        modeSwitch.appendChild(this.calibratedModeLabel);
        modeRow.appendChild(modeLabel);
        modeRow.appendChild(modeSwitch);

        const layoutRow = document.createElement('div');
        layoutRow.className = 'material-calibration-row';
        const layoutLabel = document.createElement('div');
        layoutLabel.className = 'material-calibration-row-label';
        layoutLabel.textContent = 'Layout';
        this.layoutSelect = document.createElement('select');
        this.layoutSelect.className = 'material-calibration-select';
        setSelectOptions(this.layoutSelect, [
            { id: 'full', label: 'Panel + Sphere + Cube' },
            { id: 'panel', label: 'Panel only' },
            { id: 'sphere', label: 'Sphere only' }
        ]);
        layoutRow.appendChild(layoutLabel);
        layoutRow.appendChild(this.layoutSelect);

        const tilingRow = document.createElement('div');
        tilingRow.className = 'material-calibration-row';
        const tilingLabel = document.createElement('div');
        tilingLabel.className = 'material-calibration-row-label';
        tilingLabel.textContent = 'Tiling';
        this.tilingSelect = document.createElement('select');
        this.tilingSelect.className = 'material-calibration-select';
        setSelectOptions(this.tilingSelect, [
            { id: 'default', label: 'Default' },
            { id: '2x2', label: '2×2' }
        ]);
        tilingRow.appendChild(tilingLabel);
        tilingRow.appendChild(this.tilingSelect);

        this.optionsPanel.appendChild(optionsTitle);
        this.optionsPanel.appendChild(modeRow);
        this.optionsPanel.appendChild(layoutRow);
        this.optionsPanel.appendChild(tilingRow);

        this.illuminationPanel = document.createElement('div');
        this.illuminationPanel.className = 'ui-panel is-interactive material-calibration-panel material-calibration-illumination';

        const illuminationTitle = document.createElement('div');
        illuminationTitle.className = 'ui-title';
        illuminationTitle.textContent = 'Illumination';

        const illumRow = document.createElement('div');
        illumRow.className = 'material-calibration-row';
        const illumLabel = document.createElement('div');
        illumLabel.className = 'material-calibration-row-label';
        illumLabel.textContent = 'Preset';
        this.illuminationSelect = document.createElement('select');
        this.illuminationSelect.className = 'material-calibration-select';
        setSelectOptions(this.illuminationSelect, getMaterialCalibrationIlluminationPresetOptions({ includeDefault: true }));
        illumRow.appendChild(illumLabel);
        illumRow.appendChild(this.illuminationSelect);

        this.illuminationDesc = document.createElement('div');
        this.illuminationDesc.className = 'material-calibration-hint';
        this.illuminationDesc.textContent = '';

        this.illuminationStatus = document.createElement('div');
        this.illuminationStatus.className = 'material-calibration-hint material-calibration-illumination-status';
        this.illuminationStatus.textContent = 'Default mode active';

        this.illuminationPanel.appendChild(illuminationTitle);
        this.illuminationPanel.appendChild(illumRow);
        this.illuminationPanel.appendChild(this.illuminationDesc);
        this.illuminationPanel.appendChild(this.illuminationStatus);

        this.leftDock.appendChild(this.optionsPanel);
        this.leftDock.appendChild(this.illuminationPanel);
    }

    _buildRightPanel() {
        this.adjustPanel = document.createElement('div');
        this.adjustPanel.className = 'ui-panel is-interactive material-calibration-panel material-calibration-adjust';

        const header = document.createElement('div');
        header.className = 'material-calibration-adjust-header';

        const title = document.createElement('div');
        title.className = 'ui-title';
        title.textContent = 'Material';

        this.exitBtn = document.createElement('button');
        this.exitBtn.type = 'button';
        this.exitBtn.className = 'material-calibration-btn';
        this.exitBtn.textContent = 'Exit';

        header.appendChild(title);
        header.appendChild(this.exitBtn);

        this.activeMaterialIdEl = document.createElement('div');
        this.activeMaterialIdEl.className = 'material-calibration-mono';
        this.activeMaterialIdEl.textContent = '-';

        const baselineRow = document.createElement('div');
        baselineRow.className = 'material-calibration-row';
        const baselineLabel = document.createElement('div');
        baselineLabel.className = 'material-calibration-row-label';
        baselineLabel.textContent = 'Baseline';
        this.baselineSelect = document.createElement('select');
        this.baselineSelect.className = 'material-calibration-select';
        baselineRow.appendChild(baselineLabel);
        baselineRow.appendChild(this.baselineSelect);

        this.resetOverridesBtn = document.createElement('button');
        this.resetOverridesBtn.type = 'button';
        this.resetOverridesBtn.className = 'material-calibration-btn material-calibration-btn-secondary';
        this.resetOverridesBtn.textContent = 'Reset overrides';

        this.overridesGrid = document.createElement('div');
        this.overridesGrid.className = 'material-calibration-overrides';
        this._buildOverrideControls();

        this.adjustPanel.appendChild(header);
        this.adjustPanel.appendChild(this.activeMaterialIdEl);
        this.adjustPanel.appendChild(baselineRow);
        this.adjustPanel.appendChild(this.resetOverridesBtn);
        this.adjustPanel.appendChild(this.overridesGrid);

        this.actionsPanel = document.createElement('div');
        this.actionsPanel.className = 'ui-panel is-interactive material-calibration-panel material-calibration-actions';

        const actionsTitle = document.createElement('div');
        actionsTitle.className = 'ui-title';
        actionsTitle.textContent = 'Actions';

        const actionsRow = document.createElement('div');
        actionsRow.className = 'material-calibration-actions-row';

        this.exportBtn = document.createElement('button');
        this.exportBtn.type = 'button';
        this.exportBtn.className = 'material-calibration-btn';
        this.exportBtn.textContent = 'Export';

        this.screenshotBtn = document.createElement('button');
        this.screenshotBtn.type = 'button';
        this.screenshotBtn.className = 'material-calibration-btn';
        this.screenshotBtn.textContent = 'Screenshot';

        actionsRow.appendChild(this.exportBtn);
        actionsRow.appendChild(this.screenshotBtn);
        this.actionsPanel.appendChild(actionsTitle);
        this.actionsPanel.appendChild(actionsRow);

        this.rightDock.appendChild(this.adjustPanel);
        this.rightDock.appendChild(this.actionsPanel);
    }

    _buildCatalogPanel() {
        const header = document.createElement('div');
        header.className = 'material-calibration-catalog-header';

        const title = document.createElement('div');
        title.className = 'ui-title';
        title.textContent = 'Catalog';

        this.selectedCountEl = document.createElement('div');
        this.selectedCountEl.className = 'material-calibration-hint';
        this.selectedCountEl.textContent = '0/3 selected';

        header.appendChild(title);
        header.appendChild(this.selectedCountEl);

        const classRow = document.createElement('div');
        classRow.className = 'material-calibration-row material-calibration-row-wide';
        const classLabel = document.createElement('div');
        classLabel.className = 'material-calibration-row-label';
        classLabel.textContent = 'Category';
        this.classSelect = document.createElement('select');
        this.classSelect.className = 'material-calibration-select';
        classRow.appendChild(classLabel);
        classRow.appendChild(this.classSelect);

        this.catalogGrid = document.createElement('div');
        this.catalogGrid.className = 'material-calibration-grid';

        this.bottomDock.appendChild(header);
        this.bottomDock.appendChild(classRow);
        this.bottomDock.appendChild(this.catalogGrid);
    }

    _buildCenterTools() {
        this.rulerBtn = document.createElement('button');
        this.rulerBtn.type = 'button';
        this.rulerBtn.className = 'material-calibration-tool-btn';
        this.rulerBtn.dataset.action = 'toggle-ruler';
        applyMaterialSymbolToButton(this.rulerBtn, { name: 'straighten', label: 'Ruler', size: 'md' });
        this.centerTools.appendChild(this.rulerBtn);

        this.slotCameraBtns = [];
        for (let i = 0; i < 3; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'material-calibration-tool-btn material-calibration-slot-camera-btn';
            btn.dataset.action = 'focus-slot';
            btn.dataset.slotIndex = String(i);
            applyMaterialSymbolToButton(btn, { name: 'photo_camera', label: `Focus platform ${i + 1}`, size: 'md' });
            const number = document.createElement('span');
            number.className = 'material-calibration-slot-camera-num';
            number.textContent = String(i + 1);
            btn.appendChild(number);
            this.centerTools.appendChild(btn);
            this.slotCameraBtns.push(btn);
        }
        this._syncSlotCameraButtons();
    }

    _buildOverrideControls() {
        this._overrideInputs = [];
        for (const control of OVERRIDE_CONTROL_DEFS) {
            if (control?.type === 'switch') this._appendSwitchOverrideControl(control);
            else this._appendNumericOverrideControl(control);
        }
    }

    _appendNumericOverrideControl(control) {
        const row = document.createElement('div');
        row.className = 'material-calibration-control-row';
        row.dataset.id = control.id;

        const lab = document.createElement('div');
        lab.className = 'material-calibration-row-label';
        lab.textContent = control.label;

        const body = document.createElement('div');
        body.className = 'material-calibration-control-body';

        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'material-calibration-range';
        range.min = String(control.min);
        range.max = String(control.max);
        range.step = String(control.step);

        const num = document.createElement('input');
        num.type = 'number';
        num.className = 'material-calibration-number';
        num.min = String(control.min);
        num.max = String(control.max);
        num.step = String(control.step);

        const props = getOverrideControlPropNames(control.id);
        this[props.range] = range;
        this[props.number] = num;
        this._registerOverrideInput(range);
        this._registerOverrideInput(num);

        const sync = (value) => this._setNumericOverrideControlValue(control, value);
        range.addEventListener('input', () => sync(parseNumberInput(range.value, Number(control.min))));
        num.addEventListener('input', () => sync(parseNumberInput(num.value, Number(control.min))));
        sync(Number(control.min));

        body.appendChild(range);
        body.appendChild(num);
        row.appendChild(lab);
        row.appendChild(body);
        this.overridesGrid.appendChild(row);
    }

    _appendSwitchOverrideControl(control) {
        const row = document.createElement('div');
        row.className = 'material-calibration-control-row';
        row.dataset.id = control.id;

        const lab = document.createElement('div');
        lab.className = 'material-calibration-row-label';
        lab.textContent = control.label;

        const body = document.createElement('div');
        body.className = 'material-calibration-control-body material-calibration-control-body-switch';

        const switchWrap = document.createElement('label');
        switchWrap.className = 'material-calibration-switch material-calibration-switch-sm';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'material-calibration-switch-input';
        this[control.id] = input;
        this._registerOverrideInput(input);

        const track = document.createElement('span');
        track.className = 'material-calibration-switch-track';

        switchWrap.appendChild(input);
        switchWrap.appendChild(track);
        body.appendChild(switchWrap);
        row.appendChild(lab);
        row.appendChild(body);
        this.overridesGrid.appendChild(row);
    }

    _setNumericOverrideControlValue(control, value) {
        const props = getOverrideControlPropNames(control.id);
        const range = this[props.range];
        const num = this[props.number];
        if (!range || !num) return;

        const min = Number(control.min);
        const max = Number(control.max);
        const digits = Number(control.digits ?? 2);
        const parsed = Number(value);
        const fallback = Number(control.min);
        const next = Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
        range.value = String(next);
        num.value = next.toFixed(digits);
    }

    _registerOverrideInput(input) {
        if (!input) return;
        this._overrideInputs.push(input);
    }

    _getOverrideInputs() {
        return this._overrideInputs.slice();
    }

    _handleCatalogClick(e) {
        const target = e?.target ?? null;
        const card = target?.closest?.('[data-material-id]') ?? null;
        const materialId = toId(card?.dataset?.materialId);
        if (!materialId) return;
        this.onToggleMaterial?.(materialId);
    }

    _handleCenterToolsClick(e) {
        const target = e?.target ?? null;
        const actionEl = target?.closest?.('[data-action]') ?? null;
        const action = actionEl?.dataset?.action ?? null;
        if (!action) return;

        if (action === 'toggle-ruler') {
            e.preventDefault?.();
            this.onToggleRuler?.(!this._rulerEnabled);
            return;
        }

        if (action === 'focus-slot') {
            e.preventDefault?.();
            const idx = Number(actionEl?.dataset?.slotIndex);
            if (!Number.isFinite(idx)) return;
            this.onFocusSlot?.(idx);
        }
    }

    _handleOverridesInput() {
        if (this._suppressOverrides) return;
        if (this._calibrationMode !== 'calibrated') return;
        const id = this._activeMaterialId;
        if (!id) return;
        this.onSetOverrides?.(id, this.getOverridesFromUi());
    }

    _getRoughnessRemapFromUi({ includeIdentity = false } = {}) {
        const minRaw = clamp(parseNumberInput(this.roughnessRemapMinNumber?.value, 0), 0, 1);
        const maxRaw = clamp(parseNumberInput(this.roughnessRemapMaxNumber?.value, 1), 0, 1);
        const gamma = clamp(parseNumberInput(this.roughnessRemapGammaNumber?.value, 1), 0.1, 4);
        const lowRaw = clamp(parseNumberInput(this.roughnessRemapLowPercentileNumber?.value, 0), 0, 100);
        const highRaw = clamp(parseNumberInput(this.roughnessRemapHighPercentileNumber?.value, 100), 0, 100);
        const min = Math.min(minRaw, maxRaw);
        const max = Math.max(minRaw, maxRaw);
        const lowPercentile = Math.min(lowRaw, highRaw);
        const highPercentile = Math.max(lowRaw, highRaw);
        const invertInput = !!this.roughnessRemapInvertInput?.checked;

        const out = {
            min,
            max,
            gamma,
            invertInput
        };
        if (highPercentile > lowPercentile) {
            out.lowPercentile = lowPercentile;
            out.highPercentile = highPercentile;
        }

        const eps = 1e-6;
        const lowForIdentity = out.lowPercentile ?? 0;
        const highForIdentity = out.highPercentile ?? 100;
        const isIdentity = (
            Math.abs(out.min - 0) <= eps
            && Math.abs(out.max - 1) <= eps
            && Math.abs(out.gamma - 1) <= eps
            && Math.abs(lowForIdentity - 0) <= eps
            && Math.abs(highForIdentity - 100) <= eps
            && out.invertInput !== true
        );
        if (isIdentity && includeIdentity !== true) return null;
        return out;
    }

    getOverridesFromUi({ includeIdentityRoughnessRemap = false } = {}) {
        const out = {};
        for (const control of OVERRIDE_CONTROL_DEFS) {
            if (control?.type !== 'number' || control?.bindGroup !== 'topLevel') continue;
            const props = getOverrideControlPropNames(control.id);
            out[control.bindKey] = parseNumberInput(this[props.number]?.value, null);
        }
        const roughnessRemap = this._getRoughnessRemapFromUi({ includeIdentity: includeIdentityRoughnessRemap });
        if (roughnessRemap) out.roughnessRemap = roughnessRemap;
        return out;
    }

    setClassOptions(options) {
        this._classOptions = Array.isArray(options) ? options : [];
        setSelectOptions(this.classSelect, this._classOptions);
    }

    setMaterialOptions(options) {
        this._materialOptions = Array.isArray(options) ? options : [];
        this._renderCatalogCards();
    }

    setIlluminationPresetOptions(options) {
        const opts = Array.isArray(options) ? options : getMaterialCalibrationIlluminationPresetOptions({ includeDefault: true });
        setSelectOptions(this.illuminationSelect, opts);
    }

    setSelectedClassId(classId) {
        const id = toId(classId);
        this._selectedClassId = id || null;
        if (this.classSelect) this.classSelect.value = id;
        this._renderCatalogCards();
    }

    setLayoutMode(layoutMode) {
        if (this.layoutSelect) this.layoutSelect.value = toId(layoutMode);
    }

    setCalibrationMode(calibrationMode) {
        const id = toId(calibrationMode);
        this._calibrationMode = id === 'raw' ? 'raw' : 'calibrated';
        if (this.calibrationModeToggle) this.calibrationModeToggle.checked = this._calibrationMode === 'calibrated';
        this._syncCalibrationModeToggleLabels();
        this._setOverridesEnabled(!!this._activeMaterialId);
    }

    setTilingMode(tilingMode) {
        if (this.tilingSelect) this.tilingSelect.value = toId(tilingMode);
    }

    setIlluminationPresetId(presetId) {
        const id = toId(presetId);
        if (this.illuminationSelect) this.illuminationSelect.value = id;
        if (!id) {
            this.illuminationDesc.textContent = 'User mode: global resolver (L1 defaults + L2 saved browser overrides).';
            return;
        }
        const preset = getMaterialCalibrationIlluminationPresetById(id, { fallbackToFirst: false });
        this.illuminationDesc.textContent = preset?.description ?? 'Preset unavailable; default mode is in use.';
    }

    setIlluminationStatus({ mode = 'default', reason = null } = {}) {
        if (!this.illuminationStatus) return;

        this.illuminationStatus.classList.remove('is-preset');
        this.illuminationStatus.classList.remove('is-warning');

        if (mode === 'calibration_preset') {
            this.illuminationStatus.classList.add('is-preset');
            this.illuminationStatus.textContent = 'Preset mode active (full replacement snapshot).';
            return;
        }

        if (reason === 'missing_preset') {
            this.illuminationStatus.classList.add('is-warning');
            this.illuminationStatus.textContent = 'Selected preset is missing; using default mode.';
            return;
        }

        if (reason === 'incomplete_preset') {
            this.illuminationStatus.classList.add('is-warning');
            this.illuminationStatus.textContent = 'Selected preset is incomplete; using default mode.';
            return;
        }

        this.illuminationStatus.textContent = 'Default mode active (L1 + L2).';
    }

    setSelectedMaterials({ slotMaterialIds = null, activeSlotIndex = 0, baselineMaterialId = null } = {}) {
        const slots = Array.isArray(slotMaterialIds) ? slotMaterialIds.slice(0, 3) : [null, null, null];
        while (slots.length < 3) slots.push(null);

        this._slotMaterialIds = slots;
        this._activeSlotIndex = Number.isFinite(activeSlotIndex) ? (activeSlotIndex | 0) : 0;
        this._baselineMaterialId = toId(baselineMaterialId) || null;

        const count = slots.filter(Boolean).length;
        this.selectedCountEl.textContent = `${count}/3 selected`;

        const baselineOpts = slots
            .map((id) => toId(id))
            .filter(Boolean)
            .map((id) => ({ id, label: id }));
        setSelectOptions(this.baselineSelect, baselineOpts, { placeholder: baselineOpts.length ? null : 'None' });
        if (this._baselineMaterialId && baselineOpts.some((o) => o.id === this._baselineMaterialId)) {
            this.baselineSelect.value = this._baselineMaterialId;
        }

        this._syncSlotCameraButtons();
        this._renderCatalogCards();
    }

    setSelectedSlotCameraIndex(slotIndex = null) {
        const hasValue = slotIndex !== null && slotIndex !== undefined && slotIndex !== '';
        const idx = hasValue ? Number(slotIndex) : NaN;
        if (Number.isFinite(idx) && idx >= 0 && idx <= 2) this._selectedSlotCameraIndex = idx | 0;
        else this._selectedSlotCameraIndex = null;
        this._syncSlotCameraButtons();
    }

    setScreenshotBusy(enabled) {
        const busy = !!enabled;
        if (!this.screenshotBtn) return;
        this.screenshotBtn.disabled = busy;
        this.screenshotBtn.textContent = busy ? 'Capturing…' : 'Screenshot';
    }

    setActiveMaterial({ materialId = null, overrides = null } = {}) {
        const id = toId(materialId);
        this._activeMaterialId = id || null;
        this._activeOverrides = overrides && typeof overrides === 'object' ? overrides : null;
        this.activeMaterialIdEl.textContent = this._activeMaterialId ?? '-';

        this._suppressOverrides = true;
        try {
            const ovr = this._activeOverrides ?? {};
            this._setOverridesUi(ovr);
            this._setOverridesEnabled(!!this._activeMaterialId);
        } finally {
            this._suppressOverrides = false;
        }
    }

    _setOverridesEnabled(enabled) {
        const on = !!enabled && this._calibrationMode === 'calibrated';
        for (const el of this._getOverrideInputs()) el.disabled = !on;
        if (this.resetOverridesBtn) this.resetOverridesBtn.disabled = !on;
    }

    _syncCalibrationModeToggleLabels() {
        const calibratedActive = this._calibrationMode === 'calibrated';
        this.calibratedModeLabel?.classList?.toggle?.('is-active', calibratedActive);
        this.rawModeLabel?.classList?.toggle?.('is-active', !calibratedActive);
    }

    _setOverridesUi(ovr) {
        const remap = ovr.roughnessRemap && typeof ovr.roughnessRemap === 'object' ? ovr.roughnessRemap : null;
        for (const control of OVERRIDE_CONTROL_DEFS) {
            if (control?.type === 'switch') {
                const input = this[control.id];
                if (!input) continue;
                if (control.bindGroup === 'roughnessRemap') input.checked = remap?.[control.bindKey] === true;
                else input.checked = ovr?.[control.bindKey] === true;
                continue;
            }

            if (control?.type !== 'number') continue;
            let nextValue = control.defaultValue;
            if (control.bindGroup === 'roughnessRemap') nextValue = remap?.[control.bindKey] ?? control.defaultValue;
            else nextValue = ovr?.[control.bindKey] ?? control.defaultValue;
            this._setNumericOverrideControlValue(control, nextValue);
        }
    }

    setRulerEnabled(enabled) {
        this._rulerEnabled = !!enabled;
        this.rulerBtn?.classList?.toggle?.('is-active', this._rulerEnabled);
        applyMaterialSymbolToButton(this.rulerBtn, { name: 'straighten', label: 'Ruler', size: 'md', active: this._rulerEnabled });
    }

    _syncSlotCameraButtons() {
        const active = Number.isFinite(this._selectedSlotCameraIndex) ? (this._selectedSlotCameraIndex | 0) : -1;
        for (let i = 0; i < 3; i++) {
            this.slotCameraBtns?.[i]?.classList?.toggle?.('is-active', i === active);
        }
    }

    setRulerLabel({ visible = false, x = 0, y = 0, text = '' } = {}) {
        const show = !!visible && Number.isFinite(x) && Number.isFinite(y) && typeof text === 'string' && text;
        if (!show) {
            this.rulerLabel.style.display = 'none';
            return;
        }
        this.rulerLabel.textContent = text;
        this.rulerLabel.style.display = 'block';
        this.rulerLabel.style.left = `${x}px`;
        this.rulerLabel.style.top = `${y}px`;
    }

    _renderCatalogCards() {
        if (!this.catalogGrid) return;
        const classId = this._selectedClassId;
        const list = Array.isArray(this._materialOptions) ? this._materialOptions : [];

        const cards = classId ? list.filter((opt) => toId(opt?.classId) === classId) : list;
        this.catalogGrid.textContent = '';

        for (const opt of cards) {
            const id = toId(opt?.id);
            if (!id) continue;
            const label = String(opt?.label ?? id);
            const previewUrl = typeof opt?.previewUrl === 'string' ? opt.previewUrl : null;

            const card = document.createElement('div');
            card.className = 'material-calibration-card';
            card.dataset.materialId = id;

            const selected = isSelectedMaterial(id, this._slotMaterialIds);
            const slotIndex = selected ? getSlotIndexForMaterialId(id, this._slotMaterialIds) : null;
            const isActive = slotIndex !== null && slotIndex === (this._activeSlotIndex | 0);
            const isBaseline = !!this._baselineMaterialId && this._baselineMaterialId === id;

            if (selected) card.classList.add('is-selected');
            if (isActive) card.classList.add('is-active');
            if (isBaseline) card.classList.add('is-baseline');

            const thumb = document.createElement('div');
            thumb.className = 'material-calibration-thumb';
            if (previewUrl) {
                const img = document.createElement('img');
                img.className = 'material-calibration-thumb-img';
                img.src = previewUrl;
                img.alt = '';
                thumb.appendChild(img);
            } else {
                thumb.classList.add('is-empty');
            }

            const meta = document.createElement('div');
            meta.className = 'material-calibration-meta';

            const name = document.createElement('div');
            name.className = 'material-calibration-card-label';
            name.textContent = label;
            meta.appendChild(name);

            if (slotIndex !== null) {
                const badge = document.createElement('div');
                badge.className = 'material-calibration-badge';
                badge.textContent = `#${slotIndex + 1}`;
                meta.appendChild(badge);
            }

            card.appendChild(thumb);
            card.appendChild(meta);

            this.catalogGrid.appendChild(card);
        }
    }
}
