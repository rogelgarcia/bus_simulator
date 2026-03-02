// src/graphics/gui/coloring_debugger/ColoringDebuggerUI.js
// Options-dock UI for the standalone Coloring Debugger scene.

import { resolveWallBaseTintStateFromWallBase, WALL_BASE_TINT_STATE_DEFAULT } from '../../../app/buildings/WallBaseTintModel.js';
import { createMaterialPickerRowController } from '../shared/material_picker/MaterialPickerRowController.js';
import { MaterialPickerPopupController } from '../shared/material_picker/MaterialPickerPopupController.js';
import { setMaterialThumbToTexture } from '../shared/material_picker/materialThumb.js';
import { SharedHsvbTintPicker } from '../shared/tint_picker/SharedHsvbTintPicker.js';

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function createSliderRow({
    label = '',
    value = 0,
    min = 0,
    max = 1,
    step = 0.01,
    digits = 2,
    onInput = null
} = {}) {
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

    const emit = (raw) => {
        const next = clamp(raw, min, max, value);
        range.value = String(next);
        number.value = String(next.toFixed(digits));
        onInput?.(next);
    };

    range.addEventListener('input', () => emit(Number(range.value)));
    number.addEventListener('input', () => emit(Number(number.value)));

    right.appendChild(range);
    right.appendChild(number);
    row.appendChild(left);
    row.appendChild(right);

    return {
        row,
        range,
        number,
        setValue: (next) => {
            const safe = clamp(next, min, max, value);
            range.value = String(safe);
            number.value = String(safe.toFixed(digits));
        }
    };
}

export class ColoringDebuggerUI {
    constructor({
        materialOptions = [],
        materialSections = [],
        initialState = null,
        onMaterialChange = null,
        onTintChange = null,
        onRoughnessChange = null,
        onNormalStrengthChange = null
    } = {}) {
        this._materialOptions = Array.isArray(materialOptions) ? materialOptions.slice() : [];
        this._materialById = new Map(this._materialOptions.map((entry) => [String(entry?.id ?? ''), entry]));
        this._sections = this._buildMaterialSections(materialSections);

        const src = initialState && typeof initialState === 'object' ? initialState : {};
        this._selectedMaterialId = typeof src.materialId === 'string' ? src.materialId : '';
        this._wallBase = src.wallBase && typeof src.wallBase === 'object' ? { ...src.wallBase } : {};

        this._onMaterialChange = typeof onMaterialChange === 'function' ? onMaterialChange : null;
        this._onTintChange = typeof onTintChange === 'function' ? onTintChange : null;
        this._onRoughnessChange = typeof onRoughnessChange === 'function' ? onRoughnessChange : null;
        this._onNormalStrengthChange = typeof onNormalStrengthChange === 'function' ? onNormalStrengthChange : null;

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-coloring-debugger';
        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');
        this.root.appendChild(this.panel);

        const header = makeEl('div', 'options-header');
        header.appendChild(makeEl('div', 'options-title', 'Coloring Debugger'));
        header.appendChild(makeEl('div', 'options-subtitle', 'RMB orbit · MMB pan · Wheel zoom · Esc back'));
        this.panel.appendChild(header);

        this.body = makeEl('div', 'options-body');
        this.panel.appendChild(this.body);

        const materialSection = makeEl('div', 'options-section');
        materialSection.appendChild(makeEl('div', 'options-section-title', 'Wall Material'));
        this._materialPicker = createMaterialPickerRowController({
            label: 'Wall material',
            rowExtraClassName: 'coloring-debugger-material-row',
            onPick: () => this._openMaterialPicker()
        });
        materialSection.appendChild(this._materialPicker.row);
        this._materialIdEl = makeEl('div', 'coloring-debugger-material-id', '');
        materialSection.appendChild(this._materialIdEl);
        materialSection.appendChild(makeEl('div', 'coloring-debugger-hint', 'Picker includes all PBR material categories and tabs (no reduced subset).'));
        this.body.appendChild(materialSection);

        const colorSection = makeEl('div', 'options-section');
        colorSection.appendChild(makeEl('div', 'options-section-title', 'Color'));
        this._tintPicker = new SharedHsvbTintPicker({
            initialState: resolveWallBaseTintStateFromWallBase(this._wallBase, WALL_BASE_TINT_STATE_DEFAULT),
            onChange: (nextState) => this._onTintChange?.(nextState)
        });
        colorSection.appendChild(this._tintPicker.element);
        this.body.appendChild(colorSection);

        const surfaceSection = makeEl('div', 'options-section');
        surfaceSection.appendChild(makeEl('div', 'options-section-title', 'Normal + Roughness'));
        this._normalRow = createSliderRow({
            label: 'Normal strength',
            value: clamp(this._wallBase.normalStrength, 0.0, 2.0, 0.9),
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onInput: (next) => this._onNormalStrengthChange?.(next)
        });
        this._roughnessRow = createSliderRow({
            label: 'Roughness',
            value: clamp(this._wallBase.roughness, 0.0, 1.0, 0.85),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onInput: (next) => this._onRoughnessChange?.(next)
        });
        surfaceSection.appendChild(this._normalRow.row);
        surfaceSection.appendChild(this._roughnessRow.row);
        this.body.appendChild(surfaceSection);

        this._materialPopup = new MaterialPickerPopupController();
        this._syncMaterialPicker();
    }

    _buildMaterialSections(rawSections) {
        const sections = Array.isArray(rawSections) ? rawSections : [];
        const out = [];
        const seenIds = new Set();
        for (const section of sections) {
            if (!section || typeof section !== 'object') continue;
            const label = typeof section.label === 'string' ? section.label : '';
            const rawOptions = Array.isArray(section.options) ? section.options : [];
            const options = [];
            for (const raw of rawOptions) {
                const id = typeof raw?.id === 'string' ? raw.id : '';
                if (!id || seenIds.has(id)) continue;
                const opt = this._materialById.get(id);
                if (!opt) continue;
                seenIds.add(id);
                options.push(opt);
            }
            if (!options.length) continue;
            out.push({ label, options });
        }
        const remaining = this._materialOptions.filter((opt) => {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            return !!id && !seenIds.has(id);
        });
        if (remaining.length) out.push({ label: 'Other', options: remaining });
        if (out.length) return out;
        return [{ label: 'All materials', options: this._materialOptions }];
    }

    mount(parent = document.body) {
        const host = parent && typeof parent.appendChild === 'function' ? parent : document.body;
        if (this.root.parentElement === host) return;
        this.unmount();
        host.appendChild(this.root);
    }

    unmount() {
        this.root.remove();
    }

    setState({
        materialId = null,
        wallBase = null
    } = {}) {
        if (materialId !== null) this._selectedMaterialId = typeof materialId === 'string' ? materialId : '';
        if (wallBase && typeof wallBase === 'object') this._wallBase = { ...wallBase };
        this._syncMaterialPicker();
        this._syncWallBaseControls();
    }

    destroy() {
        this._materialPopup?.dispose?.();
        this._materialPicker?.destroy?.();
        this._tintPicker?.dispose?.();
        this.unmount();
    }

    _openMaterialPicker() {
        this._materialPopup.open({
            title: 'Wall material',
            sections: this._sections,
            selectedId: this._selectedMaterialId,
            onSelect: (opt) => {
                const id = typeof opt?.id === 'string' ? opt.id : '';
                if (!id) return;
                this._selectedMaterialId = id;
                this._syncMaterialPicker();
                this._onMaterialChange?.(id);
            }
        });
    }

    _syncMaterialPicker() {
        const opt = this._materialById.get(this._selectedMaterialId) ?? null;
        const text = String(opt?.label ?? this._selectedMaterialId ?? 'Select material');
        const previewUrl = typeof opt?.previewUrl === 'string' ? opt.previewUrl : '';
        this._materialPicker.setText(text);
        setMaterialThumbToTexture(this._materialPicker.thumb, previewUrl, text, {
            warnTag: 'ColoringDebuggerUI'
        });
        this._materialIdEl.textContent = this._selectedMaterialId || '-';
    }

    _syncWallBaseControls() {
        this._tintPicker.setState(resolveWallBaseTintStateFromWallBase(this._wallBase, WALL_BASE_TINT_STATE_DEFAULT));
        this._normalRow.setValue(clamp(this._wallBase.normalStrength, 0.0, 2.0, 0.9));
        this._roughnessRow.setValue(clamp(this._wallBase.roughness, 0.0, 1.0, 0.85));
    }
}
