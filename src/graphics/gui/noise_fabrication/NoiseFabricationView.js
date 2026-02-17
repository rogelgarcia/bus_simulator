// src/graphics/gui/noise_fabrication/NoiseFabricationView.js
// Standalone Noise fabrication tool view/controller.
// @ts-check

import {
    applyGeneratorPresetToParams,
    generateNoiseFieldFromState,
    getNoiseFabricationDefaultState,
    getNoiseTextureGeneratorById,
    listNoiseTextureGenerators,
    NOISE_FABRICATION_TEXTURE_SIZES,
    sanitizeNoiseFabricationState
} from './NoiseTextureGeneratorRegistry.js';
import { parseNoiseFabricationRecipeText, stringifyNoiseFabricationRecipe } from './NoiseFabricationRecipe.js';
import { renderNoiseFieldToRgba } from './NoisePreviewRenderer.js';

const STORAGE_KEY = 'bus_sim.noise_fabrication.state.v1';

function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function normalizeHexColor(value, fallback = '#888888') {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    const v = raw.startsWith('#') ? raw.slice(1) : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toUpperCase();
    }
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`.toUpperCase();
    return fallback;
}

function isTextEditingElement(target) {
    const el = target && typeof target === 'object' ? target : null;
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return !!el.isContentEditable;
    const type = String(el.type || '').toLowerCase();
    if (!type) return true;
    return type === 'text' || type === 'search' || type === 'email' || type === 'password' || type === 'url' || type === 'tel' || type === 'number';
}

function createToggleRow({ label, value = false, onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const sw = makeEl('label', 'options-toggle-switch');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'options-toggle';
    input.checked = value === true;

    const ui = makeEl('span', 'options-toggle-ui');
    sw.appendChild(input);
    sw.appendChild(ui);

    input.addEventListener('change', () => onChange?.(input.checked));

    right.appendChild(sw);
    row.appendChild(left);
    row.appendChild(right);

    return { row, input };
}

function createTextRow({ label, value = '', onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'options-number noise-fabrication-text';
    input.value = String(value ?? '');

    const emit = () => onChange?.(String(input.value ?? ''));
    input.addEventListener('change', emit);
    input.addEventListener('blur', emit);

    right.appendChild(input);
    row.appendChild(left);
    row.appendChild(right);

    return { row, input };
}

function createRangeRow({ label, value = 0, min = 0, max = 1, step = 0.01, digits = 2, onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'options-range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(clamp(value, min, max, min));

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'options-number';
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);
    number.value = String(clamp(value, min, max, min).toFixed(digits));

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

    return { row, range, number };
}

function createSelectRow({ label, value = '', options = [], onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const select = document.createElement('select');
    select.className = 'options-number noise-fabrication-select';

    for (const opt of options) {
        const option = document.createElement('option');
        option.value = String(opt?.value ?? '');
        option.textContent = String(opt?.label ?? opt?.value ?? '');
        select.appendChild(option);
    }
    select.value = String(value ?? '');

    select.addEventListener('change', () => onChange?.(String(select.value ?? '')));

    right.appendChild(select);
    row.appendChild(left);
    row.appendChild(right);

    return { row, select };
}

function createColorRow({ label, value = '#888888', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'options-color';

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'options-number';

    const initial = normalizeHexColor(value, '#888888');
    color.value = initial;
    text.value = initial;

    const emit = (raw) => {
        const next = normalizeHexColor(raw, color.value || '#888888');
        color.value = next;
        text.value = next;
        onChange?.(next);
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

export class NoiseFabricationView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext?.('2d', { alpha: false }) ?? null;

        this.root = null;
        this._controls = {};
        this._paramInputs = new Map();

        this._state = getNoiseFabricationDefaultState();
        this._preview = null;
        this._previewImageData = null;
        this._previewCanvas = null;
        this._previewCanvasCtx = null;

        this._running = false;

        this._onResize = () => {
            this._resizeCanvas();
            this._drawPreview();
        };
        this._onKeyDown = (e) => {
            if (!e) return;
            if (e.code !== 'KeyR' && e.key !== 'r' && e.key !== 'R') return;
            if (isTextEditingElement(e.target)) return;
            e.preventDefault();
            this._regenerateAndRender();
        };
    }

    async start() {
        if (!this.ctx) throw new Error('[NoiseFabrication] Missing 2D context on canvas.');
        if (this._running) return;

        this._running = true;
        this._buildUi();

        this._state = this._loadState();
        this._syncUiFromState();

        this._resizeCanvas();
        this._regenerateAndRender();

        window.addEventListener('resize', this._onResize);
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    destroy() {
        if (!this._running) return;
        this._running = false;

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);

        this._previewImageData = null;
        this._preview = null;
        this._previewCanvas = null;
        this._previewCanvasCtx = null;

        if (this.root?.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
        this._controls = {};
        this._paramInputs.clear();
    }

    _loadState() {
        let parsed = null;
        try {
            const raw = window.localStorage?.getItem?.(STORAGE_KEY) ?? null;
            if (raw) parsed = JSON.parse(raw);
        } catch {
            parsed = null;
        }
        return sanitizeNoiseFabricationState(parsed ?? getNoiseFabricationDefaultState());
    }

    _saveState() {
        try {
            window.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(this._state));
        } catch {
        }
    }

    _buildUi() {
        const layer = makeEl('div', 'ui-layer options-layer');
        layer.id = 'ui-noise-fabrication-options';

        const panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        header.appendChild(makeEl('div', 'options-title', 'Noise fabrication'));
        header.appendChild(makeEl('div', 'options-subtitle', 'Esc back · R regenerate · Export/import parameter recipes'));

        const body = makeEl('div', 'options-body');

        const generatorSection = makeEl('div', 'options-section');
        generatorSection.appendChild(makeEl('div', 'options-section-title', 'Generator'));

        const generatorOptions = listNoiseTextureGenerators().map((generator) => ({ value: generator.id, label: generator.label }));
        const generatorRow = createSelectRow({
            label: 'Type',
            value: this._state.generatorId,
            options: generatorOptions,
            onChange: (value) => this._setGenerator(value)
        });
        generatorSection.appendChild(generatorRow.row);

        const presetRow = createSelectRow({
            label: 'Preset',
            value: this._state.activePresetId ?? '',
            options: [{ value: '', label: 'Custom' }],
            onChange: (value) => this._setPreset(value)
        });
        generatorSection.appendChild(presetRow.row);

        const previewSection = makeEl('div', 'options-section');
        previewSection.appendChild(makeEl('div', 'options-section-title', 'Preview'));

        const previewModeRow = createSelectRow({
            label: 'Mode',
            value: this._state.previewMode,
            options: [
                { value: 'texture', label: 'Texture' },
                { value: 'normal', label: 'Normal map' }
            ],
            onChange: (value) => {
                this._state = sanitizeNoiseFabricationState({ ...this._state, previewMode: value });
                this._saveState();
                this._regenerateAndRender();
                this._syncUiFromState();
            }
        });
        previewSection.appendChild(previewModeRow.row);

        const baseColorRow = createColorRow({
            label: 'Base color',
            value: this._state.baseColor,
            onChange: (value) => {
                this._state = sanitizeNoiseFabricationState({ ...this._state, baseColor: value });
                this._saveState();
                this._regenerateAndRender();
                this._syncUiFromState();
            }
        });
        previewSection.appendChild(baseColorRow.row);

        const sizeRow = createSelectRow({
            label: 'Resolution',
            value: String(this._state.textureSize),
            options: NOISE_FABRICATION_TEXTURE_SIZES.map((size) => ({ value: String(size), label: `${size} x ${size}` })),
            onChange: (value) => {
                this._state = sanitizeNoiseFabricationState({ ...this._state, textureSize: Number(value) });
                this._saveState();
                this._regenerateAndRender();
                this._syncUiFromState();
            }
        });
        previewSection.appendChild(sizeRow.row);

        const paramsSection = makeEl('div', 'options-section');
        paramsSection.appendChild(makeEl('div', 'options-section-title', 'Parameters'));
        const paramsContainer = makeEl('div', 'noise-fabrication-params');
        paramsSection.appendChild(paramsContainer);

        const recipeSection = makeEl('div', 'options-section');
        recipeSection.appendChild(makeEl('div', 'options-section-title', 'Recipe'));

        const actionsRow = makeEl('div', 'options-row options-row-wide');
        const actionsLeft = makeEl('div', 'options-row-label', 'JSON');
        const actionsRight = makeEl('div', 'options-row-control options-row-control-wide');
        const exportBtn = makeEl('button', 'options-btn options-btn-primary', 'Export');
        exportBtn.type = 'button';
        const importBtn = makeEl('button', 'options-btn', 'Import');
        importBtn.type = 'button';
        actionsRight.appendChild(exportBtn);
        actionsRight.appendChild(importBtn);
        actionsRow.appendChild(actionsLeft);
        actionsRow.appendChild(actionsRight);
        recipeSection.appendChild(actionsRow);

        const status = makeEl('div', 'options-note noise-fabrication-status', 'Ready.');
        recipeSection.appendChild(status);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.className = 'hidden';
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0] ?? null;
            fileInput.value = '';
            if (!file) return;
            await this._importRecipeFile(file);
        });

        exportBtn.addEventListener('click', () => this._exportRecipe());
        importBtn.addEventListener('click', () => fileInput.click());

        body.appendChild(generatorSection);
        body.appendChild(previewSection);
        body.appendChild(paramsSection);
        body.appendChild(recipeSection);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(fileInput);
        layer.appendChild(panel);
        document.body.appendChild(layer);

        this.root = layer;
        this._controls = {
            generatorSelect: generatorRow.select,
            presetSelect: presetRow.select,
            previewModeSelect: previewModeRow.select,
            baseColorInput: baseColorRow.color,
            baseColorText: baseColorRow.text,
            textureSizeSelect: sizeRow.select,
            paramsContainer,
            status,
            fileInput
        };
    }

    _setGenerator(generatorId) {
        const nextGenerator = getNoiseTextureGeneratorById(generatorId);
        if (!nextGenerator) return;
        const nextPresetId = nextGenerator.defaultPresetId ?? null;
        const currentParams = this._state.generatorParamsById?.[nextGenerator.id] ?? nextGenerator.defaultParams;
        const presetParams = applyGeneratorPresetToParams(nextGenerator.id, nextPresetId, currentParams);
        const generatorParamsById = {
            ...this._state.generatorParamsById,
            [nextGenerator.id]: presetParams
        };

        this._state = sanitizeNoiseFabricationState({
            ...this._state,
            generatorId: nextGenerator.id,
            activePresetId: nextPresetId,
            generatorParamsById
        });
        this._saveState();
        this._regenerateAndRender();
        this._syncUiFromState();
    }

    _setPreset(presetId) {
        const generator = getNoiseTextureGeneratorById(this._state.generatorId);
        if (!generator) return;

        if (!presetId) {
            this._state = sanitizeNoiseFabricationState({
                ...this._state,
                activePresetId: null
            });
            this._saveState();
            this._syncUiFromState();
            return;
        }

        const current = this._state.generatorParamsById?.[generator.id] ?? generator.defaultParams;
        const params = applyGeneratorPresetToParams(generator.id, presetId, current);
        const generatorParamsById = {
            ...this._state.generatorParamsById,
            [generator.id]: params
        };

        this._state = sanitizeNoiseFabricationState({
            ...this._state,
            activePresetId: presetId,
            generatorParamsById
        });
        this._saveState();
        this._regenerateAndRender();
        this._syncUiFromState();
    }

    _setParamValue(id, value) {
        const generator = getNoiseTextureGeneratorById(this._state.generatorId);
        if (!generator || !id) return;

        const current = this._state.generatorParamsById?.[generator.id] ?? generator.defaultParams;
        const nextParams = generator.sanitizeParams({
            ...current,
            [id]: value
        });

        const generatorParamsById = {
            ...this._state.generatorParamsById,
            [generator.id]: nextParams
        };

        this._state = sanitizeNoiseFabricationState({
            ...this._state,
            activePresetId: null,
            generatorParamsById
        });

        this._saveState();
        if (this._controls?.presetSelect) this._controls.presetSelect.value = '';
        this._regenerateAndRender();
    }

    _rebuildParameterRows() {
        const container = this._controls.paramsContainer;
        if (!container) return;

        container.textContent = '';
        this._paramInputs.clear();

        const generator = getNoiseTextureGeneratorById(this._state.generatorId);
        if (!generator) return;
        const params = this._state.generatorParamsById?.[generator.id] ?? generator.defaultParams;

        for (const control of generator.controls ?? []) {
            const id = String(control?.id ?? '').trim();
            if (!id) continue;
            const label = String(control?.label ?? id);
            const type = String(control?.type ?? '').toLowerCase();
            const value = params[id];

            if (type === 'toggle') {
                const row = createToggleRow({
                    label,
                    value: value === true,
                    onChange: (next) => this._setParamValue(id, next)
                });
                container.appendChild(row.row);
                this._paramInputs.set(id, row.input);
                continue;
            }

            if (type === 'text') {
                const row = createTextRow({
                    label,
                    value: String(value ?? ''),
                    onChange: (next) => this._setParamValue(id, next)
                });
                container.appendChild(row.row);
                this._paramInputs.set(id, row.input);
                continue;
            }

            const min = Number(control?.min);
            const max = Number(control?.max);
            const step = Number(control?.step);
            const digits = Number.isFinite(control?.digits) ? Number(control.digits) : 2;
            const row = createRangeRow({
                label,
                value: Number(value),
                min: Number.isFinite(min) ? min : 0,
                max: Number.isFinite(max) ? max : 1,
                step: Number.isFinite(step) ? step : 0.01,
                digits,
                onChange: (next) => this._setParamValue(id, next)
            });
            container.appendChild(row.row);
            this._paramInputs.set(id, row.number);
        }
    }

    _syncUiFromState() {
        const generator = getNoiseTextureGeneratorById(this._state.generatorId);
        if (!generator) return;

        const controls = this._controls;
        if (!controls || !controls.generatorSelect) return;

        controls.generatorSelect.value = generator.id;

        const presetSelect = controls.presetSelect;
        if (presetSelect) {
            const previous = presetSelect.value;
            presetSelect.textContent = '';
            const customOption = document.createElement('option');
            customOption.value = '';
            customOption.textContent = 'Custom';
            presetSelect.appendChild(customOption);

            for (const preset of generator.presets ?? []) {
                const option = document.createElement('option');
                option.value = preset.id;
                option.textContent = preset.label;
                presetSelect.appendChild(option);
            }

            const nextValue = this._state.activePresetId ?? '';
            presetSelect.value = nextValue;
            if (presetSelect.value !== nextValue) presetSelect.value = '';
            if (previous !== presetSelect.value) {
                this._setStatus(nextValue ? `Preset: ${presetSelect.options[presetSelect.selectedIndex]?.textContent ?? nextValue}` : 'Preset: Custom');
            }
        }

        if (controls.previewModeSelect) controls.previewModeSelect.value = this._state.previewMode;
        if (controls.baseColorInput) controls.baseColorInput.value = normalizeHexColor(this._state.baseColor, '#888888');
        if (controls.baseColorText) controls.baseColorText.value = normalizeHexColor(this._state.baseColor, '#888888');
        if (controls.textureSizeSelect) controls.textureSizeSelect.value = String(this._state.textureSize);

        this._rebuildParameterRows();
    }

    _setStatus(text) {
        if (this._controls.status) this._controls.status.textContent = String(text ?? '');
    }

    _resizeCanvas() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const cssW = Math.max(1, Math.floor(rect.width));
        const cssH = Math.max(1, Math.floor(rect.height));
        const dpr = clamp(window.devicePixelRatio || 1, 1, 2, 1);
        const w = Math.max(1, Math.floor(cssW * dpr));
        const h = Math.max(1, Math.floor(cssH * dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }

    _regenerateAndRender() {
        if (!this._running) return;
        const startedAt = performance.now();
        const generated = generateNoiseFieldFromState(this._state);
        this._state = generated.state;

        const rgba = renderNoiseFieldToRgba(generated.field, generated.width, generated.height, {
            previewMode: this._state.previewMode,
            baseColor: this._state.baseColor,
            normalStrength: 2.0
        });

        this._preview = {
            width: generated.width,
            height: generated.height,
            rgba
        };

        this._previewImageData = new ImageData(rgba, generated.width, generated.height);
        this._saveState();
        this._drawPreview();

        const elapsed = Math.max(0, performance.now() - startedAt);
        const generator = getNoiseTextureGeneratorById(this._state.generatorId);
        this._setStatus(`Generated ${generated.width} x ${generated.height} ${generator?.label ?? generated.generatorId} in ${elapsed.toFixed(1)} ms`);
    }

    _drawPreview() {
        if (!this.ctx || !this.canvas) return;
        this._resizeCanvas();

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0F151D');
        bg.addColorStop(1, '#0A0F15');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        if (!this._previewImageData) return;

        if (!this._previewCanvas || !this._previewCanvasCtx || this._previewCanvas.width !== this._previewImageData.width || this._previewCanvas.height !== this._previewImageData.height) {
            this._previewCanvas = document.createElement('canvas');
            this._previewCanvas.width = this._previewImageData.width;
            this._previewCanvas.height = this._previewImageData.height;
            this._previewCanvasCtx = this._previewCanvas.getContext('2d', { alpha: false });
        }

        if (!this._previewCanvasCtx) return;
        this._previewCanvasCtx.putImageData(this._previewImageData, 0, 0);

        const drawSize = Math.max(1, Math.floor(Math.min(w, h) * 0.78));
        const drawX = Math.floor((w - drawSize) * 0.5);
        const drawY = Math.floor((h - drawSize) * 0.5);

        ctx.fillStyle = '#141A24';
        ctx.fillRect(drawX - 8, drawY - 8, drawSize + 16, drawSize + 16);

        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this._previewCanvas, drawX, drawY, drawSize, drawSize);

        ctx.strokeStyle = 'rgba(235, 245, 255, 0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX - 0.5, drawY - 0.5, drawSize + 1, drawSize + 1);

        ctx.fillStyle = 'rgba(235, 245, 255, 0.92)';
        ctx.font = `${Math.max(12, Math.floor(drawSize * 0.03))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const modeLabel = this._state.previewMode === 'normal' ? 'NORMAL PREVIEW' : 'TEXTURE PREVIEW';
        ctx.fillText(modeLabel, drawX + 10, drawY + 10);
    }

    async _exportRecipe() {
        try {
            const json = stringifyNoiseFabricationRecipe(this._state);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const name = `noise_recipe_${this._state.generatorId}_${stamp}.json`;

            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);

            this._setStatus(`Exported ${name}`);
        } catch (err) {
            console.error('[NoiseFabrication] Export failed', err);
            this._setStatus('Export failed.');
        }
    }

    async _importRecipeFile(file) {
        try {
            const text = await file.text();
            const parsedState = parseNoiseFabricationRecipeText(text);
            this._state = sanitizeNoiseFabricationState(parsedState);
            this._saveState();
            this._syncUiFromState();
            this._regenerateAndRender();
            this._setStatus(`Imported ${file.name}`);
        } catch (err) {
            console.error('[NoiseFabrication] Import failed', err);
            this._setStatus(err?.message ? `Import failed: ${err.message}` : 'Import failed.');
        }
    }
}
