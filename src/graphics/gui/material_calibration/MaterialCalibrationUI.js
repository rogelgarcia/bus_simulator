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
        this.onSelectIlluminationPreset = null;
        this.onSetBaselineMaterial = null;
        this.onSetOverrides = null;
        this.onToggleRuler = null;

        this._classOptions = [];
        this._materialOptions = [];
        this._selectedClassId = null;
        this._slotMaterialIds = [null, null, null];
        this._activeSlotIndex = 0;
        this._baselineMaterialId = null;
        this._activeMaterialId = null;
        this._activeOverrides = null;
        this._rulerEnabled = false;

        this._bound = false;
        this._suppressOverrides = false;

        this._onExitClick = (e) => {
            e.preventDefault();
            this.onExit?.();
        };
        this._onClassChange = () => this.onSelectClass?.(this.classSelect.value);
        this._onLayoutChange = () => this.onSetLayoutMode?.(this.layoutSelect.value);
        this._onTilingChange = () => this.onSetTilingMode?.(this.tilingSelect.value);
        this._onIlluminationChange = () => this.onSelectIlluminationPreset?.(this.illuminationSelect.value);
        this._onBaselineChange = () => this.onSetBaselineMaterial?.(this.baselineSelect.value);
        this._onCatalogClick = (e) => this._handleCatalogClick(e);
        this._onRulerClick = (e) => this._handleRulerClick(e);
        this._onOverridesInput = () => this._handleOverridesInput();
        this._onResetOverrides = (e) => {
            e.preventDefault();
            if (!this._activeMaterialId) return;
            this.onSetOverrides?.(this._activeMaterialId, {});
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

        this.exitBtn?.addEventListener?.('click', this._onExitClick, { passive: false });
        this.classSelect?.addEventListener?.('change', this._onClassChange);
        this.layoutSelect?.addEventListener?.('change', this._onLayoutChange);
        this.tilingSelect?.addEventListener?.('change', this._onTilingChange);
        this.illuminationSelect?.addEventListener?.('change', this._onIlluminationChange);
        this.baselineSelect?.addEventListener?.('change', this._onBaselineChange);
        this.catalogGrid?.addEventListener?.('click', this._onCatalogClick);
        this.rulerBtn?.addEventListener?.('click', this._onRulerClick, { passive: false });

        for (const el of this._getOverrideInputs()) {
            el.addEventListener('input', this._onOverridesInput);
            el.addEventListener('change', this._onOverridesInput);
        }

        this.resetOverridesBtn?.addEventListener?.('click', this._onResetOverrides, { passive: false });
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;

        this.exitBtn?.removeEventListener?.('click', this._onExitClick);
        this.classSelect?.removeEventListener?.('change', this._onClassChange);
        this.layoutSelect?.removeEventListener?.('change', this._onLayoutChange);
        this.tilingSelect?.removeEventListener?.('change', this._onTilingChange);
        this.illuminationSelect?.removeEventListener?.('change', this._onIlluminationChange);
        this.baselineSelect?.removeEventListener?.('change', this._onBaselineChange);
        this.catalogGrid?.removeEventListener?.('click', this._onCatalogClick);
        this.rulerBtn?.removeEventListener?.('click', this._onRulerClick);

        for (const el of this._getOverrideInputs()) {
            el.removeEventListener('input', this._onOverridesInput);
            el.removeEventListener('change', this._onOverridesInput);
        }

        this.resetOverridesBtn?.removeEventListener?.('click', this._onResetOverrides);
    }

    _buildLeftPanels() {
        this.optionsPanel = document.createElement('div');
        this.optionsPanel.className = 'ui-panel is-interactive material-calibration-panel material-calibration-options';

        const optionsTitle = document.createElement('div');
        optionsTitle.className = 'ui-title';
        optionsTitle.textContent = 'Options';

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

        this.rightDock.appendChild(this.adjustPanel);
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
        applyMaterialSymbolToButton(this.rulerBtn, { name: 'straighten', label: 'Ruler', size: 'md' });
        this.centerTools.appendChild(this.rulerBtn);
    }

    _buildOverrideControls() {
        const makeRow = (label, { min, max, step, digits = 2, id }) => {
            const row = document.createElement('div');
            row.className = 'material-calibration-control-row';
            row.dataset.id = id;

            const lab = document.createElement('div');
            lab.className = 'material-calibration-row-label';
            lab.textContent = label;

            const body = document.createElement('div');
            body.className = 'material-calibration-control-body';

            const range = document.createElement('input');
            range.type = 'range';
            range.className = 'material-calibration-range';
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);

            const num = document.createElement('input');
            num.type = 'number';
            num.className = 'material-calibration-number';
            num.min = String(min);
            num.max = String(max);
            num.step = String(step);

            const sync = (value) => {
                const v = clamp(value, Number(min), Number(max));
                range.value = String(v);
                num.value = v.toFixed(digits);
            };

            range.addEventListener('input', () => sync(parseNumberInput(range.value, Number(min))));
            num.addEventListener('input', () => sync(parseNumberInput(num.value, Number(min))));
            sync(Number(min));

            body.appendChild(range);
            body.appendChild(num);
            row.appendChild(lab);
            row.appendChild(body);
            return { row, range, num };
        };

        const tile = makeRow('Tile meters', { id: 'tileMeters', min: 0.25, max: 16, step: 0.05, digits: 2 });
        this.tileMetersRange = tile.range;
        this.tileMetersNumber = tile.num;
        this.overridesGrid.appendChild(tile.row);

        const albedoBright = makeRow('Albedo bright', { id: 'albedoBrightness', min: 0, max: 4, step: 0.01, digits: 2 });
        this.albedoBrightnessRange = albedoBright.range;
        this.albedoBrightnessNumber = albedoBright.num;
        this.overridesGrid.appendChild(albedoBright.row);

        const albedoSat = makeRow('Albedo sat', { id: 'albedoSaturation', min: -1, max: 1, step: 0.01, digits: 2 });
        this.albedoSaturationRange = albedoSat.range;
        this.albedoSaturationNumber = albedoSat.num;
        this.overridesGrid.appendChild(albedoSat.row);

        const rough = makeRow('Roughness', { id: 'roughness', min: 0, max: 1, step: 0.01, digits: 2 });
        this.roughnessRange = rough.range;
        this.roughnessNumber = rough.num;
        this.overridesGrid.appendChild(rough.row);

        const normal = makeRow('Normal int', { id: 'normalStrength', min: 0, max: 4, step: 0.01, digits: 2 });
        this.normalStrengthRange = normal.range;
        this.normalStrengthNumber = normal.num;
        this.overridesGrid.appendChild(normal.row);

        const ao = makeRow('AO int', { id: 'aoIntensity', min: 0, max: 2, step: 0.01, digits: 2 });
        this.aoIntensityRange = ao.range;
        this.aoIntensityNumber = ao.num;
        this.overridesGrid.appendChild(ao.row);

        const metal = makeRow('Metalness', { id: 'metalness', min: 0, max: 1, step: 0.01, digits: 2 });
        this.metalnessRange = metal.range;
        this.metalnessNumber = metal.num;
        this.overridesGrid.appendChild(metal.row);
    }

    _getOverrideInputs() {
        return [
            this.tileMetersRange,
            this.tileMetersNumber,
            this.albedoBrightnessRange,
            this.albedoBrightnessNumber,
            this.albedoSaturationRange,
            this.albedoSaturationNumber,
            this.roughnessRange,
            this.roughnessNumber,
            this.normalStrengthRange,
            this.normalStrengthNumber,
            this.aoIntensityRange,
            this.aoIntensityNumber,
            this.metalnessRange,
            this.metalnessNumber
        ].filter(Boolean);
    }

    _handleCatalogClick(e) {
        const target = e?.target ?? null;
        const action = target?.closest?.('[data-action]')?.dataset?.action ?? null;
        const card = target?.closest?.('[data-material-id]') ?? null;
        const materialId = toId(card?.dataset?.materialId);
        if (!materialId) return;

        if (action === 'focus') {
            e.preventDefault();
            this.onFocusMaterial?.(materialId);
            return;
        }

        this.onToggleMaterial?.(materialId);
    }

    _handleRulerClick(e) {
        e.preventDefault();
        this.onToggleRuler?.(!this._rulerEnabled);
    }

    _handleOverridesInput() {
        if (this._suppressOverrides) return;
        const id = this._activeMaterialId;
        if (!id) return;
        this.onSetOverrides?.(id, this.getOverridesFromUi());
    }

    getOverridesFromUi() {
        return {
            tileMeters: parseNumberInput(this.tileMetersNumber?.value, null),
            albedoBrightness: parseNumberInput(this.albedoBrightnessNumber?.value, null),
            albedoSaturation: parseNumberInput(this.albedoSaturationNumber?.value, null),
            roughness: parseNumberInput(this.roughnessNumber?.value, null),
            normalStrength: parseNumberInput(this.normalStrengthNumber?.value, null),
            aoIntensity: parseNumberInput(this.aoIntensityNumber?.value, null),
            metalness: parseNumberInput(this.metalnessNumber?.value, null)
        };
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

        this._renderCatalogCards();
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
        const on = !!enabled;
        for (const el of this._getOverrideInputs()) el.disabled = !on;
        if (this.resetOverridesBtn) this.resetOverridesBtn.disabled = !on;
    }

    _setOverridesUi(ovr) {
        const set = (range, num, value, { min, max, digits = 2 } = {}) => {
            if (!range || !num) return;
            const vRaw = Number.isFinite(Number(value)) ? Number(value) : null;
            const v = vRaw === null ? Number(min) : clamp(vRaw, Number(min), Number(max));
            range.value = String(v);
            num.value = v.toFixed(digits);
        };

        set(this.tileMetersRange, this.tileMetersNumber, ovr.tileMeters ?? null, { min: 0.25, max: 16, digits: 2 });
        set(this.albedoBrightnessRange, this.albedoBrightnessNumber, ovr.albedoBrightness ?? 1.0, { min: 0, max: 4, digits: 2 });
        set(this.albedoSaturationRange, this.albedoSaturationNumber, ovr.albedoSaturation ?? 0.0, { min: -1, max: 1, digits: 2 });
        set(this.roughnessRange, this.roughnessNumber, ovr.roughness ?? 1.0, { min: 0, max: 1, digits: 2 });
        set(this.normalStrengthRange, this.normalStrengthNumber, ovr.normalStrength ?? 1.0, { min: 0, max: 4, digits: 2 });
        set(this.aoIntensityRange, this.aoIntensityNumber, ovr.aoIntensity ?? 1.0, { min: 0, max: 2, digits: 2 });
        set(this.metalnessRange, this.metalnessNumber, ovr.metalness ?? 0.0, { min: 0, max: 1, digits: 2 });
    }

    setRulerEnabled(enabled) {
        this._rulerEnabled = !!enabled;
        this.rulerBtn?.classList?.toggle?.('is-active', this._rulerEnabled);
        applyMaterialSymbolToButton(this.rulerBtn, { name: 'straighten', label: 'Ruler', size: 'md', active: this._rulerEnabled });
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

            const actions = document.createElement('div');
            actions.className = 'material-calibration-card-actions';

            const focusBtn = document.createElement('button');
            focusBtn.type = 'button';
            focusBtn.className = 'material-calibration-icon-btn';
            focusBtn.dataset.action = 'focus';
            applyMaterialSymbolToButton(focusBtn, { name: 'center_focus_strong', label: 'Focus camera', size: 'sm' });
            actions.appendChild(focusBtn);

            card.appendChild(thumb);
            card.appendChild(meta);
            card.appendChild(actions);

            this.catalogGrid.appendChild(card);
        }
    }
}
