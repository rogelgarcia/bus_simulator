// src/graphics/gui/noise_fabrication/NoiseFabricationView.js
// Standalone Noise fabrication tool view/controller.
// @ts-check

import {
    addNoiseLayerFromCatalog,
    describeNoiseLayer,
    duplicateNoiseLayer,
    generateNoiseFieldFromState,
    getNoiseFabricationExecutionPlan,
    getNoiseFabricationDefaultState,
    getNoiseLayerById,
    listNoiseBlendModes,
    listNoiseExecutionModes,
    listNoiseExecutionPaths,
    listNoiseLayerMapTargets,
    listNoiseTextureGenerators,
    NOISE_FABRICATION_TEXTURE_SIZES,
    renameNoiseLayer,
    reorderNoiseLayers,
    replaceNoiseLayerFromCatalog,
    sanitizeNoiseFabricationState,
    setNoiseFabricationActiveLayer,
    setNoiseFabricationBaseColor,
    setNoiseFabricationExportTargets,
    setNoiseFabricationPreviewMode,
    setNoiseFabricationTextureSize,
    setNoiseFabricationExecutionAssistantQuestions,
    setNoiseLayerBlendMode,
    setNoiseLayerDynamicRuntime,
    setNoiseLayerExecutionManualPath,
    setNoiseLayerExecutionMode,
    setNoiseLayerLock,
    setNoiseLayerLargeScaleWorld,
    setNoiseLayerMapTarget,
    setNoiseLayerParam,
    setNoiseLayerPreset,
    setNoiseLayerSolo,
    setNoiseLayerStrength,
    setNoiseLayerTransform
} from './NoiseTextureGeneratorRegistry.js';
import { getNoiseCatalogEntryById, listNoiseCatalogEntries } from './NoiseFabricationCatalog.js';
import { parseNoiseFabricationRecipeText, stringifyNoiseFabricationRecipe } from './NoiseFabricationRecipe.js';
import { renderNoiseFieldToRgba } from './NoisePreviewRenderer.js';

const STORAGE_KEY_V2 = 'bus_sim.noise_fabrication.state.v2';
const STORAGE_KEY_V1 = 'bus_sim.noise_fabrication.state.v1';

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

function createTextAreaRow({ label, value = '', rows = 2, onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const input = document.createElement('textarea');
    input.className = 'noise-fabrication-textarea';
    input.rows = rows;
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

function setInputsDisabled(inputRefs, disabled) {
    if (!Array.isArray(inputRefs)) return;
    for (const ref of inputRefs) {
        if (!ref) continue;
        ref.disabled = disabled;
    }
}

export class NoiseFabricationView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext?.('2d', { alpha: false }) ?? null;

        this.root = null;
        this._controls = {};
        this._state = getNoiseFabricationDefaultState();
        this._preview = null;
        this._previewImageData = null;
        this._previewCanvas = null;
        this._previewCanvasCtx = null;
        this._running = false;

        this._catalogEntries = listNoiseCatalogEntries();
        this._pickerMode = 'replace';
        this._hoveredPickerNoiseId = this._catalogEntries[0]?.id ?? '';
        this._pendingReorderIds = [];
        this._pendingExecutionAssistantOverrides = {};
        this._executionAssistantPlan = null;

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
        if (!this._state.layers.find((layer) => layer.id === this._state.activeLayerId)) {
            this._state = setNoiseFabricationActiveLayer(this._state, this._state.layers[0]?.id ?? '');
        }

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
    }

    _loadState() {
        let parsed = null;
        try {
            const raw = window.localStorage?.getItem?.(STORAGE_KEY_V2) ?? window.localStorage?.getItem?.(STORAGE_KEY_V1) ?? null;
            if (raw) parsed = JSON.parse(raw);
        } catch {
            parsed = null;
        }
        return sanitizeNoiseFabricationState(parsed ?? getNoiseFabricationDefaultState());
    }

    _saveState() {
        try {
            window.localStorage?.setItem?.(STORAGE_KEY_V2, JSON.stringify(this._state));
        } catch {
        }
    }

    _commitState(nextState, { sync = true, regenerate = true } = {}) {
        this._state = sanitizeNoiseFabricationState(nextState);
        this._saveState();
        if (sync) this._syncUiFromState();
        if (regenerate) this._regenerateAndRender();
    }

    _setPickerMode(mode) {
        this._pickerMode = mode === 'add' ? 'add' : 'replace';
        this._renderLayerTabs();
        this._renderNoisePicker();
    }

    _buildUi() {
        const layer = makeEl('div', 'ui-layer options-layer');
        layer.id = 'ui-noise-fabrication-options';

        const panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        header.appendChild(makeEl('div', 'options-title', 'Noise fabrication'));
        header.appendChild(makeEl('div', 'options-subtitle', 'Esc back · R regenerate · Layered stack + catalog picker'));

        const body = makeEl('div', 'options-body');

        const stackSection = makeEl('div', 'options-section');
        const stackHeaderRow = makeEl('div', 'noise-stack-header');
        stackHeaderRow.appendChild(makeEl('div', 'options-section-title', 'Layer stack'));
        const reorderBtn = makeEl('button', 'options-btn noise-stack-reorder-btn', 'Reorder');
        reorderBtn.type = 'button';
        reorderBtn.innerHTML = '<span class="ui-icon">swap_vert</span><span>Reorder</span>';
        stackHeaderRow.appendChild(reorderBtn);
        stackSection.appendChild(stackHeaderRow);

        const tabsContainer = makeEl('div', 'noise-layer-tabs');
        stackSection.appendChild(tabsContainer);
        stackSection.appendChild(makeEl('div', 'options-note noise-stack-note', 'Tab order is deterministic (left-to-right evaluation).'));

        const pickerSection = makeEl('div', 'options-section');
        const pickerHeader = makeEl('div', 'noise-picker-header');
        pickerHeader.appendChild(makeEl('div', 'options-section-title', 'Noise picker'));
        const pickerModeBadge = makeEl('div', 'noise-picker-mode', '');
        pickerHeader.appendChild(pickerModeBadge);
        pickerSection.appendChild(pickerHeader);

        const pickerGrid = makeEl('div', 'noise-picker-grid');
        pickerSection.appendChild(pickerGrid);
        const pickerDetails = makeEl('div', 'noise-picker-details');
        pickerSection.appendChild(pickerDetails);

        const layerEditorSection = makeEl('div', 'options-section');
        layerEditorSection.appendChild(makeEl('div', 'options-section-title', 'Active layer'));
        const layerEditor = makeEl('div', 'noise-layer-editor');
        layerEditorSection.appendChild(layerEditor);

        const previewSection = makeEl('div', 'options-section');
        previewSection.appendChild(makeEl('div', 'options-section-title', 'Preview'));

        const previewModeRow = createSelectRow({
            label: 'Mode',
            value: this._state.previewMode,
            options: [
                { value: 'texture', label: 'Texture (Albedo)' },
                { value: 'normal', label: 'Normal map' }
            ],
            onChange: (value) => {
                const next = setNoiseFabricationPreviewMode(this._state, value);
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        previewSection.appendChild(previewModeRow.row);

        const baseColorRow = createColorRow({
            label: 'Base color',
            value: this._state.baseColor,
            onChange: (value) => {
                const next = setNoiseFabricationBaseColor(this._state, value);
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        previewSection.appendChild(baseColorRow.row);

        const sizeRow = createSelectRow({
            label: 'Resolution',
            value: String(this._state.textureSize),
            options: NOISE_FABRICATION_TEXTURE_SIZES.map((size) => ({ value: String(size), label: `${size} x ${size}` })),
            onChange: (value) => {
                const next = setNoiseFabricationTextureSize(this._state, Number(value));
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        previewSection.appendChild(sizeRow.row);

        const exportSection = makeEl('div', 'options-section');
        exportSection.appendChild(makeEl('div', 'options-section-title', 'Recipe export'));

        const exportNormalToggle = createToggleRow({
            label: 'Export Normal',
            value: this._state.exportTargets.normal,
            onChange: (checked) => {
                const next = setNoiseFabricationExportTargets(this._state, {
                    ...this._state.exportTargets,
                    normal: checked
                });
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        exportSection.appendChild(exportNormalToggle.row);

        const exportAlbedoToggle = createToggleRow({
            label: 'Export Albedo',
            value: this._state.exportTargets.albedo,
            onChange: (checked) => {
                const next = setNoiseFabricationExportTargets(this._state, {
                    ...this._state.exportTargets,
                    albedo: checked
                });
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        exportSection.appendChild(exportAlbedoToggle.row);

        const exportOrmToggle = createToggleRow({
            label: 'Export ORM',
            value: this._state.exportTargets.orm,
            onChange: (checked) => {
                const next = setNoiseFabricationExportTargets(this._state, {
                    ...this._state.exportTargets,
                    orm: checked
                });
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        exportSection.appendChild(exportOrmToggle.row);

        const actionsRow = makeEl('div', 'options-row options-row-wide');
        const actionsLeft = makeEl('div', 'options-row-label', 'JSON');
        const actionsRight = makeEl('div', 'options-row-control options-row-control-wide');
        const exportBtn = makeEl('button', 'options-btn options-btn-primary', 'Export (Assistant)');
        exportBtn.type = 'button';
        const importBtn = makeEl('button', 'options-btn', 'Import recipe');
        importBtn.type = 'button';
        actionsRight.appendChild(exportBtn);
        actionsRight.appendChild(importBtn);
        actionsRow.appendChild(actionsLeft);
        actionsRow.appendChild(actionsRight);
        exportSection.appendChild(actionsRow);

        exportSection.appendChild(makeEl('div', 'options-note noise-export-note', 'Baked map outputs are unavailable in this AI scope. Export writes deterministic stack recipe JSON only.'));

        const status = makeEl('div', 'options-note noise-fabrication-status', 'Ready.');
        exportSection.appendChild(status);

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

        exportBtn.addEventListener('click', () => this._openExecutionAssistantPopup());
        importBtn.addEventListener('click', () => fileInput.click());
        reorderBtn.addEventListener('click', () => this._openReorderPopup());

        body.appendChild(stackSection);
        body.appendChild(pickerSection);
        body.appendChild(layerEditorSection);
        body.appendChild(previewSection);
        body.appendChild(exportSection);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(fileInput);
        layer.appendChild(panel);

        const reorderOverlay = makeEl('div', 'noise-fabrication-modal-overlay hidden');
        const reorderPanel = makeEl('div', 'ui-panel is-interactive noise-fabrication-modal-panel');
        const reorderHeader = makeEl('div', 'noise-fabrication-modal-header');
        reorderHeader.appendChild(makeEl('div', 'noise-fabrication-modal-title', 'Reorder layers'));
        const reorderClose = makeEl('button', 'options-btn', 'Close');
        reorderClose.type = 'button';
        reorderHeader.appendChild(reorderClose);

        const reorderList = makeEl('div', 'noise-fabrication-reorder-list');

        const reorderFooter = makeEl('div', 'noise-fabrication-modal-footer');
        const reorderApply = makeEl('button', 'options-btn options-btn-primary', 'Apply order');
        reorderApply.type = 'button';
        const reorderCancel = makeEl('button', 'options-btn', 'Cancel');
        reorderCancel.type = 'button';
        reorderFooter.appendChild(reorderApply);
        reorderFooter.appendChild(reorderCancel);

        reorderPanel.appendChild(reorderHeader);
        reorderPanel.appendChild(reorderList);
        reorderPanel.appendChild(reorderFooter);
        reorderOverlay.appendChild(reorderPanel);

        reorderOverlay.addEventListener('click', (event) => {
            if (event.target === reorderOverlay) this._closeReorderPopup();
        });
        reorderClose.addEventListener('click', () => this._closeReorderPopup());
        reorderCancel.addEventListener('click', () => this._closeReorderPopup());
        reorderApply.addEventListener('click', () => {
            const next = reorderNoiseLayers(this._state, this._pendingReorderIds);
            this._closeReorderPopup();
            this._commitState(next, { sync: true, regenerate: true });
            this._setStatus('Applied deterministic layer reorder.');
        });

        const executionOverlay = makeEl('div', 'noise-fabrication-modal-overlay hidden');
        const executionPanel = makeEl('div', 'ui-panel is-interactive noise-fabrication-modal-panel noise-execution-modal-panel');
        const executionHeader = makeEl('div', 'noise-fabrication-modal-header');
        executionHeader.appendChild(makeEl('div', 'noise-fabrication-modal-title', 'Execution Decision Assistant'));
        const executionClose = makeEl('button', 'options-btn', 'Close');
        executionClose.type = 'button';
        executionHeader.appendChild(executionClose);

        const executionQuestions = makeEl('div', 'noise-execution-assistant-questions');
        const questionDynamic = createToggleRow({
            label: 'Dynamic scene context',
            value: this._state.executionAssistantQuestions?.dynamicSceneContext === true,
            onChange: (checked) => this._onExecutionAssistantQuestionChange('dynamicSceneContext', checked)
        });
        const questionLargeWorld = createToggleRow({
            label: 'Large world usage',
            value: this._state.executionAssistantQuestions?.largeWorldContext === true,
            onChange: (checked) => this._onExecutionAssistantQuestionChange('largeWorldContext', checked)
        });
        const questionPreferBaked = createToggleRow({
            label: 'Prioritize baked perf',
            value: this._state.executionAssistantQuestions?.preferBakedPerformance === true,
            onChange: (checked) => this._onExecutionAssistantQuestionChange('preferBakedPerformance', checked)
        });
        executionQuestions.appendChild(questionDynamic.row);
        executionQuestions.appendChild(questionLargeWorld.row);
        executionQuestions.appendChild(questionPreferBaked.row);

        const executionList = makeEl('div', 'noise-execution-assistant-list');
        const executionConfirmRow = makeEl('div', 'noise-execution-confirm-row');
        const executionConfirmToggle = createToggleRow({
            label: 'Confirm layer choices',
            value: false,
            onChange: (checked) => this._setExecutionAssistantConfirmed(checked)
        });
        executionConfirmRow.appendChild(executionConfirmToggle.row);

        const executionFooter = makeEl('div', 'noise-fabrication-modal-footer');
        const executionApplyBtn = makeEl('button', 'options-btn options-btn-primary', 'Confirm and Export');
        executionApplyBtn.type = 'button';
        executionApplyBtn.disabled = true;
        const executionCancelBtn = makeEl('button', 'options-btn', 'Cancel');
        executionCancelBtn.type = 'button';
        executionFooter.appendChild(executionApplyBtn);
        executionFooter.appendChild(executionCancelBtn);

        executionPanel.appendChild(executionHeader);
        executionPanel.appendChild(executionQuestions);
        executionPanel.appendChild(executionList);
        executionPanel.appendChild(executionConfirmRow);
        executionPanel.appendChild(executionFooter);
        executionOverlay.appendChild(executionPanel);

        executionOverlay.addEventListener('click', (event) => {
            if (event.target === executionOverlay) this._closeExecutionAssistantPopup();
        });
        executionClose.addEventListener('click', () => this._closeExecutionAssistantPopup());
        executionCancelBtn.addEventListener('click', () => this._closeExecutionAssistantPopup());
        executionApplyBtn.addEventListener('click', () => this._confirmExecutionAssistantAndExport());

        document.body.appendChild(layer);
        document.body.appendChild(reorderOverlay);
        document.body.appendChild(executionOverlay);

        this.root = layer;
        this._controls = {
            tabsContainer,
            pickerGrid,
            pickerDetails,
            pickerModeBadge,
            layerEditor,
            previewModeSelect: previewModeRow.select,
            baseColorInput: baseColorRow.color,
            baseColorText: baseColorRow.text,
            textureSizeSelect: sizeRow.select,
            exportNormalToggle: exportNormalToggle.input,
            exportAlbedoToggle: exportAlbedoToggle.input,
            exportOrmToggle: exportOrmToggle.input,
            status,
            fileInput,
            reorderOverlay,
            reorderList,
            executionOverlay,
            executionQuestions: {
                dynamicSceneContext: questionDynamic.input,
                largeWorldContext: questionLargeWorld.input,
                preferBakedPerformance: questionPreferBaked.input
            },
            executionList,
            executionConfirmToggle: executionConfirmToggle.input,
            executionApplyBtn
        };
    }

    _setExecutionAssistantConfirmed(checked) {
        if (this._controls.executionApplyBtn) {
            this._controls.executionApplyBtn.disabled = checked !== true;
        }
    }

    _readExecutionAssistantQuestionsFromUi() {
        const q = this._controls.executionQuestions;
        return {
            dynamicSceneContext: q?.dynamicSceneContext?.checked === true,
            largeWorldContext: q?.largeWorldContext?.checked === true,
            preferBakedPerformance: q?.preferBakedPerformance?.checked === true
        };
    }

    _openExecutionAssistantPopup() {
        this._pendingExecutionAssistantOverrides = {};
        if (this._controls.executionConfirmToggle) this._controls.executionConfirmToggle.checked = false;
        this._setExecutionAssistantConfirmed(false);

        const questions = this._state.executionAssistantQuestions ?? {
            dynamicSceneContext: false,
            largeWorldContext: false,
            preferBakedPerformance: false
        };
        if (this._controls.executionQuestions) {
            this._controls.executionQuestions.dynamicSceneContext.checked = questions.dynamicSceneContext === true;
            this._controls.executionQuestions.largeWorldContext.checked = questions.largeWorldContext === true;
            this._controls.executionQuestions.preferBakedPerformance.checked = questions.preferBakedPerformance === true;
        }

        this._refreshExecutionAssistantPlan();
        this._controls.executionOverlay?.classList.remove('hidden');
    }

    _closeExecutionAssistantPopup() {
        this._controls.executionOverlay?.classList.add('hidden');
        this._executionAssistantPlan = null;
        this._pendingExecutionAssistantOverrides = {};
        if (this._controls.executionConfirmToggle) this._controls.executionConfirmToggle.checked = false;
        this._setExecutionAssistantConfirmed(false);
    }

    _onExecutionAssistantQuestionChange() {
        this._refreshExecutionAssistantPlan();
    }

    _refreshExecutionAssistantPlan() {
        const questions = this._readExecutionAssistantQuestionsFromUi();
        const nextState = setNoiseFabricationExecutionAssistantQuestions(this._state, questions);
        this._state = sanitizeNoiseFabricationState(nextState);
        this._saveState();

        this._executionAssistantPlan = getNoiseFabricationExecutionPlan(this._state, {
            questions: this._state.executionAssistantQuestions,
            manualOverridesByLayerId: this._pendingExecutionAssistantOverrides
        });
        this._renderExecutionAssistantRows();
        this._renderLayerTabs();
        this._rebuildLayerEditor();
    }

    _renderExecutionAssistantRows() {
        const list = this._controls.executionList;
        if (!list) return;
        list.textContent = '';

        const plan = this._executionAssistantPlan;
        if (!plan) {
            list.appendChild(makeEl('div', 'options-note', 'No execution plan available.'));
            return;
        }

        const summary = makeEl('div', 'noise-execution-summary', `Final paths → Shader: ${plan.summary.shader} · Baked: ${plan.summary.textureBaked} · Hybrid: ${plan.summary.hybrid}`);
        list.appendChild(summary);

        for (const entry of plan.layers) {
            const row = makeEl('div', 'noise-execution-row');

            const top = makeEl('div', 'noise-execution-row-top');
            top.appendChild(makeEl('div', 'noise-execution-layer-name', entry.layerName || entry.layerId));
            top.appendChild(makeEl('div', 'noise-execution-layer-recommended', `Recommended: ${entry.recommendedPath}`));
            row.appendChild(top);

            const metrics = makeEl('div', 'noise-execution-row-metrics', `HF ${entry.scores.highFrequency.toFixed(2)} · Large ${entry.scores.largeScaleWorld.toFixed(2)} · Cost ${entry.scores.staticCost.toFixed(2)}`);
            row.appendChild(metrics);

            const reasons = makeEl('div', 'noise-execution-row-reasons', entry.reasons.join(' '));
            row.appendChild(reasons);

            const controlRow = makeEl('div', 'noise-execution-row-control');
            const label = makeEl('label', 'noise-execution-row-label', 'Final path');
            const select = document.createElement('select');
            select.className = 'options-number noise-fabrication-select';
            for (const opt of listNoiseExecutionPaths()) {
                const option = document.createElement('option');
                option.value = opt.id;
                option.textContent = opt.label;
                select.appendChild(option);
            }
            const selected = this._pendingExecutionAssistantOverrides[entry.layerId] ?? entry.finalPath;
            select.value = selected;
            select.addEventListener('change', () => {
                this._pendingExecutionAssistantOverrides[entry.layerId] = String(select.value || entry.finalPath);
                this._refreshExecutionAssistantPlan();
            });
            controlRow.appendChild(label);
            controlRow.appendChild(select);
            row.appendChild(controlRow);

            list.appendChild(row);
        }
    }

    async _confirmExecutionAssistantAndExport() {
        if (this._controls.executionConfirmToggle?.checked !== true) {
            this._setStatus('Confirm execution decisions before export.');
            return;
        }
        const plan = getNoiseFabricationExecutionPlan(this._state, {
            questions: this._state.executionAssistantQuestions,
            manualOverridesByLayerId: this._pendingExecutionAssistantOverrides
        });
        await this._exportRecipe({
            executionDecisionAssistant: {
                questions: plan.questions,
                summary: plan.summary,
                layers: plan.layers.map((entry) => ({
                    layerId: entry.layerId,
                    layerName: entry.layerName,
                    recommendedPath: entry.recommendedPath,
                    finalPath: entry.finalPath,
                    reasons: entry.reasons,
                    flags: entry.flags,
                    scores: entry.scores
                })),
                confirmedAt: new Date().toISOString()
            }
        });
        this._closeExecutionAssistantPopup();
    }

    _openReorderPopup() {
        this._pendingReorderIds = this._state.layers.map((layer) => layer.id);
        this._renderReorderList();
        this._controls.reorderOverlay?.classList.remove('hidden');
    }

    _closeReorderPopup() {
        this._controls.reorderOverlay?.classList.add('hidden');
        this._pendingReorderIds = [];
    }

    _movePendingReorder(id, direction) {
        const index = this._pendingReorderIds.indexOf(id);
        if (index < 0) return;
        const target = direction < 0 ? index - 1 : index + 1;
        if (target < 0 || target >= this._pendingReorderIds.length) return;
        const next = [...this._pendingReorderIds];
        const temp = next[index];
        next[index] = next[target];
        next[target] = temp;
        this._pendingReorderIds = next;
        this._renderReorderList();
    }

    _renderReorderList() {
        const list = this._controls.reorderList;
        if (!list) return;
        list.textContent = '';

        for (let i = 0; i < this._pendingReorderIds.length; i++) {
            const layerId = this._pendingReorderIds[i];
            const layer = getNoiseLayerById(this._state, layerId);
            if (!layer) continue;

            const row = makeEl('div', 'noise-fabrication-reorder-row');
            const label = makeEl('div', 'noise-fabrication-reorder-label', `${i + 1}. ${layer.name}`);
            row.appendChild(label);

            const actions = makeEl('div', 'noise-fabrication-reorder-actions');
            const upBtn = makeEl('button', 'options-btn', '↑');
            upBtn.type = 'button';
            upBtn.disabled = i <= 0;
            upBtn.addEventListener('click', () => this._movePendingReorder(layer.id, -1));

            const downBtn = makeEl('button', 'options-btn', '↓');
            downBtn.type = 'button';
            downBtn.disabled = i >= this._pendingReorderIds.length - 1;
            downBtn.addEventListener('click', () => this._movePendingReorder(layer.id, 1));

            actions.appendChild(upBtn);
            actions.appendChild(downBtn);
            row.appendChild(actions);
            list.appendChild(row);
        }
    }

    _syncUiFromState() {
        if (this._controls.previewModeSelect) this._controls.previewModeSelect.value = this._state.previewMode;
        if (this._controls.baseColorInput) this._controls.baseColorInput.value = normalizeHexColor(this._state.baseColor, '#888888');
        if (this._controls.baseColorText) this._controls.baseColorText.value = normalizeHexColor(this._state.baseColor, '#888888');
        if (this._controls.textureSizeSelect) this._controls.textureSizeSelect.value = String(this._state.textureSize);
        if (this._controls.exportNormalToggle) this._controls.exportNormalToggle.checked = this._state.exportTargets.normal;
        if (this._controls.exportAlbedoToggle) this._controls.exportAlbedoToggle.checked = this._state.exportTargets.albedo;
        if (this._controls.exportOrmToggle) this._controls.exportOrmToggle.checked = this._state.exportTargets.orm;
        if (this._controls.executionQuestions) {
            this._controls.executionQuestions.dynamicSceneContext.checked = this._state.executionAssistantQuestions?.dynamicSceneContext === true;
            this._controls.executionQuestions.largeWorldContext.checked = this._state.executionAssistantQuestions?.largeWorldContext === true;
            this._controls.executionQuestions.preferBakedPerformance.checked = this._state.executionAssistantQuestions?.preferBakedPerformance === true;
        }

        this._renderLayerTabs();
        this._renderNoisePicker();
        this._rebuildLayerEditor();
    }

    _renderLayerTabs() {
        const container = this._controls.tabsContainer;
        if (!container) return;

        container.textContent = '';
        const activeLayerId = this._state.activeLayerId;
        const plan = getNoiseFabricationExecutionPlan(this._state, { questions: this._state.executionAssistantQuestions });
        const executionByLayerId = new Map(plan.layers.map((entry) => [entry.layerId, entry.finalPath]));

        for (const layer of this._state.layers) {
            const tab = makeEl('button', 'noise-layer-tab');
            tab.type = 'button';
            tab.classList.toggle('is-active', this._pickerMode !== 'add' && layer.id === activeLayerId);
            tab.addEventListener('click', () => {
                const next = setNoiseFabricationActiveLayer(this._state, layer.id);
                this._setPickerMode('replace');
                this._commitState(next, { sync: true, regenerate: true });
            });

            const title = makeEl('span', 'noise-layer-tab-title', layer.name);
            tab.appendChild(title);

            const flags = makeEl('span', 'noise-layer-tab-flags');
            if (layer.lock) flags.appendChild(makeEl('span', 'noise-layer-tab-flag', 'L'));
            if (layer.solo) flags.appendChild(makeEl('span', 'noise-layer-tab-flag', 'S'));
            const execPath = executionByLayerId.get(layer.id) ?? 'hybrid';
            const execTag = execPath === 'texture_baked' ? 'B' : (execPath === 'shader' ? 'SH' : 'HY');
            flags.appendChild(makeEl('span', 'noise-layer-tab-flag', execTag));
            tab.appendChild(flags);

            container.appendChild(tab);
        }

        const addTab = makeEl('button', 'noise-layer-tab noise-layer-tab-add', '+');
        addTab.type = 'button';
        addTab.title = 'Add new layer from noise picker';
        addTab.classList.toggle('is-active', this._pickerMode === 'add');
        addTab.addEventListener('click', () => {
            this._setPickerMode('add');
            this._setStatus('Picker in add mode: selecting a catalog noise creates a new layer.');
        });
        container.appendChild(addTab);
    }

    _renderNoisePicker() {
        const grid = this._controls.pickerGrid;
        if (!grid) return;
        grid.textContent = '';

        const activeLayer = getNoiseLayerById(this._state, this._state.activeLayerId);
        const selectedNoiseId = this._pickerMode === 'replace' ? String(activeLayer?.noiseId ?? '') : '';

        if (this._controls.pickerModeBadge) {
            this._controls.pickerModeBadge.textContent = this._pickerMode === 'add'
                ? 'Add mode: click a noise to create a new layer'
                : 'Replace mode: click a noise to replace the active layer';
        }

        for (const entry of this._catalogEntries) {
            const card = makeEl('button', 'noise-picker-card');
            card.type = 'button';
            card.classList.toggle('is-selected', entry.id === selectedNoiseId);
            card.dataset.noiseId = entry.id;
            card.title = `${entry.displayName} · ${entry.usageExample}`;

            const title = makeEl('div', 'noise-picker-card-title', entry.displayName);
            const desc = makeEl('div', 'noise-picker-card-desc', entry.shortDescription);
            const usage = makeEl('div', 'noise-picker-card-usage', `Usage: ${entry.usageExample}`);

            const hints = makeEl('div', 'noise-picker-card-hints');
            hints.appendChild(makeEl('span', 'noise-picker-hint', 'Normal'));
            hints.appendChild(makeEl('span', 'noise-picker-hint', 'Albedo'));
            hints.appendChild(makeEl('span', 'noise-picker-hint', 'ORM'));

            card.appendChild(title);
            card.appendChild(desc);
            card.appendChild(usage);
            card.appendChild(hints);

            card.addEventListener('mouseenter', () => {
                this._hoveredPickerNoiseId = entry.id;
                this._renderNoisePickerDetails();
            });
            card.addEventListener('focus', () => {
                this._hoveredPickerNoiseId = entry.id;
                this._renderNoisePickerDetails();
            });
            card.addEventListener('click', () => this._applyPickerSelection(entry.id));

            grid.appendChild(card);
        }

        if (!this._hoveredPickerNoiseId) this._hoveredPickerNoiseId = this._catalogEntries[0]?.id ?? '';
        this._renderNoisePickerDetails();
    }

    _renderNoisePickerDetails() {
        const panel = this._controls.pickerDetails;
        if (!panel) return;
        panel.textContent = '';

        const entry = getNoiseCatalogEntryById(this._hoveredPickerNoiseId) ?? this._catalogEntries[0] ?? null;
        if (!entry) {
            panel.appendChild(makeEl('div', 'options-note', 'No noise catalog entries available.'));
            return;
        }

        panel.appendChild(makeEl('div', 'noise-picker-details-title', entry.displayName));
        panel.appendChild(makeEl('div', 'noise-picker-details-line', entry.shortDescription));
        panel.appendChild(makeEl('div', 'noise-picker-details-line', `Example: ${entry.usageExample}`));
        panel.appendChild(makeEl('div', 'noise-picker-details-line', `Effect: ${entry.hoverDetails}`));
        panel.appendChild(makeEl('div', 'noise-picker-details-line', `Mix tip: ${entry.mixGuidance}`));

        const hintsList = makeEl('div', 'noise-picker-details-hints');
        hintsList.appendChild(makeEl('div', 'noise-picker-details-hint', `Normal: ${entry.mapTargetHints.normal}`));
        hintsList.appendChild(makeEl('div', 'noise-picker-details-hint', `Albedo: ${entry.mapTargetHints.albedo}`));
        hintsList.appendChild(makeEl('div', 'noise-picker-details-hint', `ORM: ${entry.mapTargetHints.orm}`));
        panel.appendChild(hintsList);
    }

    _applyPickerSelection(noiseId) {
        const activeLayer = getNoiseLayerById(this._state, this._state.activeLayerId);
        if (this._pickerMode === 'add' || !activeLayer) {
            const next = addNoiseLayerFromCatalog(this._state, noiseId);
            this._setPickerMode('replace');
            this._commitState(next, { sync: true, regenerate: true });
            this._setStatus('Created a new layer from catalog default preset (blend=Normal, strength=1.0).');
            return;
        }

        const next = replaceNoiseLayerFromCatalog(this._state, activeLayer.id, noiseId);
        this._commitState(next, { sync: true, regenerate: true });
        this._setStatus('Replaced active layer generator from the catalog; kept layer naming/blending/strength/transform.');
    }

    _rebuildLayerEditor() {
        const container = this._controls.layerEditor;
        if (!container) return;
        container.textContent = '';

        const activeLayer = getNoiseLayerById(this._state, this._state.activeLayerId);
        if (!activeLayer) {
            container.appendChild(makeEl('div', 'options-note', 'No active layer selected.'));
            return;
        }

        const isLocked = activeLayer.lock === true;
        const generator = listNoiseTextureGenerators().find((item) => item.id === activeLayer.generatorId) ?? null;
        const mapTargetOptions = listNoiseLayerMapTargets().map((target) => ({ value: target.id, label: target.label }));
        const blendOptions = listNoiseBlendModes().map((mode) => ({ value: mode.id, label: mode.label }));

        const nameRow = createTextRow({
            label: 'Name',
            value: activeLayer.name,
            onChange: (value) => {
                const next = renameNoiseLayer(this._state, activeLayer.id, value);
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        setInputsDisabled([nameRow.input], isLocked);
        container.appendChild(nameRow.row);

        const descriptionRow = createTextAreaRow({
            label: 'Description',
            value: activeLayer.description,
            rows: 2,
            onChange: (value) => {
                const next = describeNoiseLayer(this._state, activeLayer.id, value);
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        setInputsDisabled([descriptionRow.input], isLocked);
        container.appendChild(descriptionRow.row);

        const mapTargetRow = createSelectRow({
            label: 'Map target',
            value: activeLayer.mapTarget,
            options: mapTargetOptions,
            onChange: (value) => {
                const next = setNoiseLayerMapTarget(this._state, activeLayer.id, value);
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        setInputsDisabled([mapTargetRow.select], isLocked);
        container.appendChild(mapTargetRow.row);

        const blendRow = createSelectRow({
            label: 'Blend mode',
            value: activeLayer.blendMode,
            options: blendOptions,
            onChange: (value) => {
                const next = setNoiseLayerBlendMode(this._state, activeLayer.id, value);
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        setInputsDisabled([blendRow.select], isLocked);
        container.appendChild(blendRow.row);

        const strengthRow = createRangeRow({
            label: 'Strength',
            value: activeLayer.strength,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (value) => {
                const next = setNoiseLayerStrength(this._state, activeLayer.id, value);
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        setInputsDisabled([strengthRow.range, strengthRow.number], isLocked);
        container.appendChild(strengthRow.row);

        const executionModeOptions = listNoiseExecutionModes().map((entry) => ({ value: entry.id, label: entry.label }));
        const executionPathOptions = listNoiseExecutionPaths().map((entry) => ({ value: entry.id, label: entry.label }));
        const execution = activeLayer.execution && typeof activeLayer.execution === 'object'
            ? activeLayer.execution
            : { mode: 'auto', manualPath: 'hybrid', dynamicRuntime: false, largeScaleWorld: false };

        const executionModeRow = createSelectRow({
            label: 'Execution mode',
            value: execution.mode ?? 'auto',
            options: executionModeOptions,
            onChange: (value) => {
                const next = setNoiseLayerExecutionMode(this._state, activeLayer.id, value);
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        setInputsDisabled([executionModeRow.select], isLocked);
        container.appendChild(executionModeRow.row);

        const manualPathRow = createSelectRow({
            label: 'Manual path',
            value: execution.manualPath ?? 'hybrid',
            options: executionPathOptions,
            onChange: (value) => {
                const next = setNoiseLayerExecutionManualPath(this._state, activeLayer.id, value);
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        setInputsDisabled([manualPathRow.select], isLocked || execution.mode !== 'manual');
        container.appendChild(manualPathRow.row);

        const dynamicRuntimeRow = createToggleRow({
            label: 'Dynamic runtime',
            value: execution.dynamicRuntime === true,
            onChange: (checked) => {
                const next = setNoiseLayerDynamicRuntime(this._state, activeLayer.id, checked);
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        setInputsDisabled([dynamicRuntimeRow.input], isLocked);
        container.appendChild(dynamicRuntimeRow.row);

        const largeScaleRow = createToggleRow({
            label: 'Large-scale/world',
            value: execution.largeScaleWorld === true,
            onChange: (checked) => {
                const next = setNoiseLayerLargeScaleWorld(this._state, activeLayer.id, checked);
                this._commitState(next, { sync: true, regenerate: false });
            }
        });
        setInputsDisabled([largeScaleRow.input], isLocked);
        container.appendChild(largeScaleRow.row);

        const executionPlan = getNoiseFabricationExecutionPlan(this._state, { questions: this._state.executionAssistantQuestions });
        const activeExecutionEntry = executionPlan.layers.find((entry) => entry.layerId === activeLayer.id) ?? null;
        if (activeExecutionEntry) {
            container.appendChild(makeEl(
                'div',
                'options-note noise-layer-execution-note',
                `Checker → Recommended: ${activeExecutionEntry.recommendedPath}, Final: ${activeExecutionEntry.finalPath}. ` +
                `HF ${activeExecutionEntry.scores.highFrequency.toFixed(2)}, Large ${activeExecutionEntry.scores.largeScaleWorld.toFixed(2)}, Cost ${activeExecutionEntry.scores.staticCost.toFixed(2)}.`
            ));
        }

        const controlsRow = makeEl('div', 'noise-layer-action-row');
        const duplicateBtn = makeEl('button', 'options-btn', 'Duplicate');
        duplicateBtn.type = 'button';
        duplicateBtn.addEventListener('click', () => {
            const next = duplicateNoiseLayer(this._state, activeLayer.id);
            this._commitState(next, { sync: true, regenerate: true });
        });

        const lockBtn = makeEl('button', 'options-btn', activeLayer.lock ? 'Unlock' : 'Lock');
        lockBtn.type = 'button';
        lockBtn.classList.toggle('is-active', activeLayer.lock === true);
        lockBtn.addEventListener('click', () => {
            const next = setNoiseLayerLock(this._state, activeLayer.id, !activeLayer.lock);
            this._commitState(next, { sync: true, regenerate: false });
        });

        const soloBtn = makeEl('button', 'options-btn', activeLayer.solo ? 'Unsolo' : 'Solo');
        soloBtn.type = 'button';
        soloBtn.classList.toggle('is-active', activeLayer.solo === true);
        soloBtn.addEventListener('click', () => {
            const next = setNoiseLayerSolo(this._state, activeLayer.id, !activeLayer.solo);
            this._commitState(next, { sync: true, regenerate: true });
        });

        controlsRow.appendChild(duplicateBtn);
        controlsRow.appendChild(lockBtn);
        controlsRow.appendChild(soloBtn);
        container.appendChild(controlsRow);

        const presetOptions = [{ value: '', label: 'Custom' }];
        if (generator?.presets) {
            for (const preset of generator.presets) {
                presetOptions.push({ value: preset.id, label: preset.label });
            }
        }

        const presetRow = createSelectRow({
            label: 'Preset',
            value: activeLayer.presetId ?? '',
            options: presetOptions,
            onChange: (value) => {
                if (!value) return;
                const next = setNoiseLayerPreset(this._state, activeLayer.id, value);
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        setInputsDisabled([presetRow.select], isLocked);
        container.appendChild(presetRow.row);

        const transformTitle = makeEl('div', 'options-section-title noise-layer-subtitle', 'Transforms');
        container.appendChild(transformTitle);

        const scaleRow = createRangeRow({
            label: 'Scale (UV)',
            value: activeLayer.transform.scale,
            min: 0.05,
            max: 16.0,
            step: 0.01,
            digits: 2,
            onChange: (value) => {
                const next = setNoiseLayerTransform(this._state, activeLayer.id, { scale: value, space: 'uv' });
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        setInputsDisabled([scaleRow.range, scaleRow.number], isLocked);
        container.appendChild(scaleRow.row);

        const rotationRow = createRangeRow({
            label: 'Rotation',
            value: activeLayer.transform.rotationDeg,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (value) => {
                const next = setNoiseLayerTransform(this._state, activeLayer.id, { rotationDeg: value, space: 'uv' });
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        setInputsDisabled([rotationRow.range, rotationRow.number], isLocked);
        container.appendChild(rotationRow.row);

        const offsetURow = createRangeRow({
            label: 'Offset U',
            value: activeLayer.transform.offsetU,
            min: -8,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (value) => {
                const next = setNoiseLayerTransform(this._state, activeLayer.id, { offsetU: value, space: 'uv' });
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        setInputsDisabled([offsetURow.range, offsetURow.number], isLocked);
        container.appendChild(offsetURow.row);

        const offsetVRow = createRangeRow({
            label: 'Offset V',
            value: activeLayer.transform.offsetV,
            min: -8,
            max: 8,
            step: 0.01,
            digits: 2,
            onChange: (value) => {
                const next = setNoiseLayerTransform(this._state, activeLayer.id, { offsetV: value, space: 'uv' });
                this._commitState(next, { sync: true, regenerate: true });
            }
        });
        setInputsDisabled([offsetVRow.range, offsetVRow.number], isLocked);
        container.appendChild(offsetVRow.row);

        container.appendChild(makeEl('div', 'options-note', 'Coordinate space: UV. World-space transforms are intentionally unsupported in this tool.'));

        if (!generator) {
            container.appendChild(makeEl('div', 'options-note', 'Missing generator definition for this layer.'));
            return;
        }

        const paramsTitle = makeEl('div', 'options-section-title noise-layer-subtitle', 'Generator parameters');
        container.appendChild(paramsTitle);

        for (const control of generator.controls ?? []) {
            const id = String(control?.id ?? '').trim();
            if (!id) continue;
            const type = String(control?.type ?? '').toLowerCase();
            const label = String(control?.label ?? id);
            const value = activeLayer.params?.[id];

            if (type === 'toggle') {
                const row = createToggleRow({
                    label,
                    value: value === true,
                    onChange: (nextValue) => {
                        const next = setNoiseLayerParam(this._state, activeLayer.id, id, nextValue);
                        this._commitState(next, { sync: true, regenerate: true });
                    }
                });
                setInputsDisabled([row.input], isLocked);
                container.appendChild(row.row);
                continue;
            }

            if (type === 'text') {
                const row = createTextRow({
                    label,
                    value: String(value ?? ''),
                    onChange: (nextValue) => {
                        const next = setNoiseLayerParam(this._state, activeLayer.id, id, nextValue);
                        this._commitState(next, { sync: true, regenerate: true });
                    }
                });
                setInputsDisabled([row.input], isLocked);
                container.appendChild(row.row);
                continue;
            }

            if (type === 'select') {
                const options = Array.isArray(control.options) ? control.options.map((option) => ({
                    value: option?.value,
                    label: option?.label ?? option?.value
                })) : [];
                const row = createSelectRow({
                    label,
                    value: String(value ?? ''),
                    options,
                    onChange: (nextValue) => {
                        const next = setNoiseLayerParam(this._state, activeLayer.id, id, nextValue);
                        this._commitState(next, { sync: true, regenerate: true });
                    }
                });
                setInputsDisabled([row.select], isLocked);
                container.appendChild(row.row);
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
                onChange: (nextValue) => {
                    const next = setNoiseLayerParam(this._state, activeLayer.id, id, nextValue);
                    this._commitState(next, { sync: true, regenerate: true });
                }
            });
            setInputsDisabled([row.range, row.number], isLocked);
            container.appendChild(row.row);
        }
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
        const warningText = this._state.statusWarnings.length ? ` · ${this._state.statusWarnings.join(' | ')}` : '';
        this._setStatus(`Generated ${generated.width} x ${generated.height} in ${elapsed.toFixed(1)} ms${warningText}`);
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

        const stackLabel = `Layers: ${this._state.layers.length} (${this._state.layers.filter((layer) => layer.solo).length ? 'solo active' : 'full stack'})`;
        ctx.fillText(stackLabel, drawX + 10, drawY + 30);
    }

    async _exportRecipe({ executionDecisionAssistant = null } = {}) {
        try {
            const json = stringifyNoiseFabricationRecipe(this._state, { executionDecisionAssistant });
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const name = `noise_stack_recipe_${stamp}.json`;

            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);

            this._setStatus(`Exported ${name} (stack recipe JSON only; baked maps unavailable).`);
        } catch (err) {
            console.error('[NoiseFabrication] Export failed', err);
            this._setStatus(err?.message ? `Export failed: ${err.message}` : 'Export failed.');
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
