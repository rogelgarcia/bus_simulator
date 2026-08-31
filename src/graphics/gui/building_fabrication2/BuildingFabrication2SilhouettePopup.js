// Dedicated working-copy editor for one Building Fabrication 2 floor-layer silhouette.
// @ts-check

import {
    LAYER_SILHOUETTE_MODE,
    SILHOUETTE_REMAP_DECISION,
    applySilhouetteRemapDecisions,
    cloneLayerSilhouette,
    createDetachedLayerSilhouette,
    createSilhouetteRemapReport,
    deleteSilhouetteCorner,
    getSilhouetteRunMetrics,
    insertSilhouetteCorner,
    mergeSilhouetteRuns,
    moveSilhouetteCorner,
    moveSilhouetteRun,
    normalizeLayerSilhouette,
    normalizeSilhouetteLoop,
    resolveBuildingLayerSilhouettes,
    resolveLayerSilhouette,
    setSilhouetteRunArc,
    solveSilhouettePreferredSize,
    splitSilhouetteRun,
    translateSilhouetteLoop,
    validateLayerSilhouette
} from '../../../app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js';
import {
    resolveFootprintArcRun,
    sampleResolvedFootprintArc
} from '../../../app/buildings/footprint_curves/BuildingFootprintCurves.js';
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

const HISTORY_LIMIT = 80;
const ARC_SWEEP_MIN_DEGREES = 5;
const ARC_SWEEP_MAX_DEGREES = 180;
const ARC_SWEEP_DEFAULT_DEGREES = 90;
const CANVAS_PICK_CORNER_PX = 14;
const CANVAS_PICK_FACE_PX = 11;
const CANVAS_PADDING_PX = 54;
const MIN_RUN_LENGTH_METERS = 0.01;
const DEFAULT_PREVIEW_SIZE_METERS = 24;
const TOOL = Object.freeze({
    SELECT: 'select',
    TRANSLATE: 'translate',
    INSERT: 'insert'
});
const SOURCE_MODE = Object.freeze({
    DEFAULT: LAYER_SILHOUETTE_MODE?.INHERIT_DEFAULT ?? LAYER_SILHOUETTE_MODE?.inherit_default ?? 'inherit_default',
    PREVIOUS: LAYER_SILHOUETTE_MODE?.INHERIT_PREVIOUS ?? LAYER_SILHOUETTE_MODE?.inherit_previous ?? 'inherit_previous',
    DETACHED: LAYER_SILHOUETTE_MODE?.DETACHED ?? LAYER_SILHOUETTE_MODE?.detached ?? 'detached'
});

function cloneValue(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, entry] of Object.entries(value)) out[key] = cloneValue(entry);
        return out;
    }
    return value;
}

function clamp(value, min, max, fallback = min) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
}

function finitePoint(value) {
    const x = Number(value?.x);
    const z = Number(value?.z);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function signedArea(loop) {
    const points = Array.isArray(loop) ? loop : [];
    let sum = 0;
    for (let index = 0; index < points.length; index++) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        sum += (Number(a?.x) || 0) * (Number(b?.z) || 0) - (Number(b?.x) || 0) * (Number(a?.z) || 0);
    }
    return sum * 0.5;
}

function distance(a, b) {
    return Math.hypot((Number(b?.x) || 0) - (Number(a?.x) || 0), (Number(b?.z) || 0) - (Number(a?.z) || 0));
}

function isTextEntry(target) {
    const tag = target?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target?.isContentEditable;
}

function stableSerialize(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function makeButton(label, className = 'building-fab2-btn') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
}

function makeIconButton(symbol, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'building-fab2-icon-btn building-fab2-silhouette-icon-btn';
    button.dataset.action = action;
    applyMaterialSymbolToButton(button, { name: symbol, label, size: 'sm' });
    return button;
}

function makeNumberField(labelText, role, { step = 0.1, min = null, max = null, suffix = '' } = {}) {
    const label = document.createElement('label');
    label.className = 'building-fab2-silhouette-field';
    const text = document.createElement('span');
    text.className = 'building-fab2-silhouette-field-label';
    text.textContent = labelText;
    const shell = document.createElement('span');
    shell.className = 'building-fab2-silhouette-input-shell';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'building-fab2-input building-fab2-silhouette-number';
    input.dataset.role = role;
    input.step = String(step);
    if (min !== null) input.min = String(min);
    if (max !== null) input.max = String(max);
    shell.appendChild(input);
    if (suffix) {
        const suffixEl = document.createElement('span');
        suffixEl.className = 'building-fab2-silhouette-field-suffix';
        suffixEl.textContent = suffix;
        shell.appendChild(suffixEl);
    }
    label.appendChild(text);
    label.appendChild(shell);
    return { label, input };
}

function makeToggle(labelText, role) {
    const label = document.createElement('label');
    label.className = 'building-fab2-toggle-switch building-fab2-silhouette-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.role = role;
    input.setAttribute('aria-label', labelText);
    const text = document.createElement('span');
    text.textContent = labelText;
    label.appendChild(input);
    label.appendChild(text);
    return { label, input };
}

function unwrapDocument(result, operationName) {
    const candidate = result?.document ?? result?.silhouette ?? result;
    if (!candidate || typeof candidate !== 'object') {
        throw new Error(`Silhouette ${operationName} did not return a document.`);
    }
    return candidate;
}

function remapEntriesFromReport(report) {
    const rows = report?.entries ?? report?.targets ?? report?.items ?? report?.decisions ?? [];
    return Array.isArray(rows) ? rows.map((row, index) => ({
        ...cloneValue(row),
        id: String(row?.id ?? row?.targetId ?? row?.key ?? `remap_${index + 1}`),
        label: String(row?.label ?? row?.targetLabel ?? row?.targetId ?? row?.id ?? `Affected target ${index + 1}`),
        message: String(row?.message ?? row?.reason ?? ''),
        required: row?.required === true || row?.status === 'needs_decision',
        decision: row?.decision ?? row?.value ?? null,
        options: Array.isArray(row?.options) ? cloneValue(row.options) : cloneValue(row?.candidateRunIds ?? []),
        status: String(row?.status ?? ''),
        kind: String(row?.kind ?? 'target'),
        missingRunIds: cloneValue(row?.missingRunIds ?? [])
    })) : [];
}

function validationEntries(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.issues)) return value.issues;
    const entries = [];
    for (const entry of value.errors ?? []) entries.push({ ...entry, severity: 'error' });
    for (const entry of value.warnings ?? []) entries.push({ ...entry, severity: 'warning' });
    return entries;
}

function normalizeIssue(entry, index) {
    if (typeof entry === 'string') return { id: `issue_${index}`, severity: 'error', message: entry, target: '' };
    const severity = entry?.severity === 'warning' ? 'warning' : (entry?.severity === 'info' ? 'info' : 'error');
    return {
        id: String(entry?.id ?? entry?.code ?? `issue_${index}`),
        severity,
        message: String(entry?.message ?? entry?.reason ?? entry?.code ?? 'Invalid silhouette'),
        target: String(entry?.target ?? entry?.faceId ?? entry?.runId ?? entry?.cornerId ?? '')
    };
}

function dedupeIssues(entries) {
    const seen = new Set();
    const out = [];
    for (let index = 0; index < entries.length; index++) {
        const issue = normalizeIssue(entries[index], index);
        const key = `${issue.severity}|${issue.id}|${issue.target}|${issue.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(issue);
    }
    return out;
}

function normalizeGhosts(value) {
    return (Array.isArray(value) ? value : []).map((entry, index) => {
        const rawLoop = entry?.loop ?? entry?.document?.loop ?? entry?.silhouette?.loop ?? [];
        let loop = [];
        try {
            loop = normalizeSilhouetteLoop(rawLoop).loop;
        } catch {
            loop = cloneValue(rawLoop);
        }
        return {
            layerId: String(entry?.layerId ?? entry?.id ?? `ghost_${index + 1}`),
            label: String(entry?.label ?? entry?.layerLabel ?? `Layer ${index + 1}`),
            loop,
            color: typeof entry?.color === 'string' ? entry.color : null
        };
    }).filter((entry) => Array.isArray(entry.loop) && entry.loop.length >= 3);
}

function sampleRun(loop, index, minimumSegments = 12) {
    const start = loop[index];
    const end = loop[(index + 1) % loop.length];
    const a = finitePoint(start);
    const b = finitePoint(end);
    if (!a || !b) return [];
    const curve = resolveFootprintArcRun(a, b, start?.arc);
    if (!curve) return [a, b];
    const segments = Math.max(minimumSegments, curve.segments);
    const points = [];
    for (let segment = 0; segment <= segments; segment++) {
        const sample = sampleResolvedFootprintArc(curve, curve.length * (segment / segments));
        if (sample) points.push({ x: sample.x, z: sample.z, tangent: sample.tangent, fraction: sample.fraction });
    }
    return points;
}

function pointSegmentDistanceSq(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 1e-9
        ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq))
        : 0;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const ox = point.x - x;
    const oy = point.y - y;
    return { distanceSq: ox * ox + oy * oy, t, x, y };
}

function sourceLabel(mode) {
    if (mode === SOURCE_MODE.DEFAULT) return 'Building default';
    if (mode === SOURCE_MODE.PREVIOUS) return 'Previous floor layer';
    return 'Independent silhouette';
}

function cloneDocument(value) {
    if (!value || typeof value !== 'object') return null;
    try {
        return cloneLayerSilhouette(value);
    } catch {
        return cloneValue(value);
    }
}

function safeNormalizeDocument(value) {
    if (!value || typeof value !== 'object') return null;
    try {
        return unwrapDocument(normalizeLayerSilhouette(cloneValue(value)), 'normalize');
    } catch {
        const copy = cloneDocument(value);
        if (!Array.isArray(copy?.loop) || copy.loop.length < 3) return copy;
        try {
            const normalized = normalizeSilhouetteLoop(copy.loop, { idState: copy.idState });
            return { ...copy, loop: normalized.loop, idState: normalized.idState };
        } catch {
            return copy;
        }
    }
}

function formatMeters(value, decimals = 2) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(decimals)} m` : '—';
}

function appendSelectField(parent, labelText, role, options) {
    const label = document.createElement('label');
    label.className = 'building-fab2-silhouette-field';
    const text = document.createElement('span');
    text.className = 'building-fab2-silhouette-field-label';
    text.textContent = labelText;
    const select = document.createElement('select');
    select.className = 'building-fab2-select building-fab2-silhouette-select';
    select.dataset.role = role;
    for (const [value, optionLabel] of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = optionLabel;
        select.appendChild(option);
    }
    label.appendChild(text);
    label.appendChild(select);
    parent.appendChild(label);
    return select;
}

function getRunById(documentValue, runId) {
    const loop = Array.isArray(documentValue?.loop) ? documentValue.loop : [];
    const index = loop.findIndex((point) => String(point?.runId ?? '') === String(runId ?? ''));
    if (index < 0) return null;
    return { index, start: loop[index], end: loop[(index + 1) % loop.length] };
}

function getCornerById(documentValue, cornerId) {
    const loop = Array.isArray(documentValue?.loop) ? documentValue.loop : [];
    const index = loop.findIndex((point) => String(point?.cornerId ?? '') === String(cornerId ?? ''));
    return index < 0 ? null : { index, point: loop[index] };
}

function getRunMetricsSafe(documentValue, runId) {
    try {
        const metrics = getSilhouetteRunMetrics(documentValue, runId);
        if (metrics && typeof metrics === 'object') return metrics;
    } catch {
        try {
            const metrics = getSilhouetteRunMetrics(documentValue?.loop ?? [], runId);
            if (metrics && typeof metrics === 'object') return metrics;
        } catch {
            // Fall through to canonical curve math.
        }
    }
    const run = getRunById(documentValue, runId);
    if (!run) return {};
    const chordLength = distance(run.start, run.end);
    const curve = resolveFootprintArcRun(run.start, run.end, run.start?.arc);
    const dx = Number(run.end.x) - Number(run.start.x);
    const dz = Number(run.end.z) - Number(run.start.z);
    const chordTangent = chordLength > 1e-8 ? { x: dx / chordLength, z: dz / chordLength } : { x: 1, z: 0 };
    return {
        chordLength,
        length: curve?.length ?? chordLength,
        radius: curve?.radius ?? null,
        sweepRadians: curve?.sweep ?? 0,
        sweepDegrees: (curve?.sweep ?? 0) * (180 / Math.PI),
        tangentStart: curve ? sampleResolvedFootprintArc(curve, 0)?.tangent : chordTangent,
        tangentEnd: curve ? sampleResolvedFootprintArc(curve, curve.length)?.tangent : chordTangent
    };
}

export class BuildingFabrication2SilhouettePopup {
    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'ui-picker-overlay hidden building-fab2-silhouette-overlay';
        this.overlay.dataset.role = 'silhouette-popup';

        this.panel = document.createElement('section');
        this.panel.className = 'ui-panel is-interactive building-fab2-silhouette-panel';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'true');
        this.panel.setAttribute('aria-labelledby', 'building-fab2-silhouette-title');
        this.overlay.appendChild(this.panel);

        this.header = document.createElement('header');
        this.header.className = 'building-fab2-silhouette-header';
        const heading = document.createElement('div');
        heading.className = 'building-fab2-silhouette-heading';
        this.titleEl = document.createElement('div');
        this.titleEl.id = 'building-fab2-silhouette-title';
        this.titleEl.className = 'ui-title building-fab2-silhouette-title';
        this.titleEl.textContent = 'Draw floor silhouette';
        this.subtitleEl = document.createElement('div');
        this.subtitleEl.className = 'building-fab2-hint building-fab2-silhouette-subtitle';
        heading.appendChild(this.titleEl);
        heading.appendChild(this.subtitleEl);

        this.historyControls = document.createElement('div');
        this.historyControls.className = 'building-fab2-silhouette-history';
        this.undoBtn = makeIconButton('undo', 'Undo', 'silhouette:undo');
        this.redoBtn = makeIconButton('redo', 'Redo', 'silhouette:redo');
        this.historyStatus = document.createElement('span');
        this.historyStatus.className = 'building-fab2-silhouette-history-status';
        this.historyControls.appendChild(this.undoBtn);
        this.historyControls.appendChild(this.redoBtn);
        this.historyControls.appendChild(this.historyStatus);
        this.header.appendChild(heading);
        this.header.appendChild(this.historyControls);

        this.sourceBar = document.createElement('div');
        this.sourceBar.className = 'building-fab2-silhouette-source-bar';
        const sourceText = document.createElement('div');
        sourceText.className = 'building-fab2-silhouette-source-text';
        const sourceLabelEl = document.createElement('span');
        sourceLabelEl.className = 'building-fab2-silhouette-source-label';
        sourceLabelEl.textContent = 'Shape source';
        this.sourceValue = document.createElement('strong');
        this.sourceValue.dataset.role = 'silhouette:source-status';
        sourceText.appendChild(sourceLabelEl);
        sourceText.appendChild(this.sourceValue);
        this.sourceSelect = document.createElement('select');
        this.sourceSelect.className = 'building-fab2-select building-fab2-silhouette-source-select';
        this.sourceSelect.dataset.role = 'silhouette:source';
        this.sourceOptions = new Map();
        for (const [value, label] of [
            [SOURCE_MODE.DEFAULT, 'Inherit building default'],
            [SOURCE_MODE.PREVIOUS, 'Inherit previous layer'],
            [SOURCE_MODE.DETACHED, 'Independent']
        ]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            this.sourceOptions.set(value, option);
            this.sourceSelect.appendChild(option);
        }
        this.detachBtn = makeButton('Detach and edit', 'building-fab2-btn building-fab2-btn-primary building-fab2-silhouette-detach-btn');
        this.detachBtn.dataset.action = 'silhouette:detach';
        this.sourceBar.appendChild(sourceText);
        this.sourceBar.appendChild(this.sourceSelect);
        this.sourceBar.appendChild(this.detachBtn);

        this.body = document.createElement('div');
        this.body.className = 'building-fab2-silhouette-body';
        this.workspace = document.createElement('div');
        this.workspace.className = 'building-fab2-silhouette-workspace';
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'building-fab2-silhouette-toolbar';
        this.toolButtons = new Map();
        for (const entry of [
            [TOOL.SELECT, 'arrow_selector_tool', 'Select / move'],
            [TOOL.TRANSLATE, 'open_with', 'Move whole shape'],
            [TOOL.INSERT, 'add_circle', 'Insert corner']
        ]) {
            const button = makeIconButton(entry[1], entry[2], `silhouette:tool:${entry[0]}`);
            button.classList.add('building-fab2-silhouette-tool');
            button.dataset.tool = entry[0];
            this.toolButtons.set(entry[0], button);
            this.toolbar.appendChild(button);
        }
        const toolbarDivider = document.createElement('span');
        toolbarDivider.className = 'building-fab2-silhouette-toolbar-divider';
        this.toolbar.appendChild(toolbarDivider);
        this.splitBtn = makeButton('Split face', 'building-fab2-btn building-fab2-btn-small');
        this.splitBtn.dataset.action = 'silhouette:split';
        this.mergeBtn = makeButton('Merge at end', 'building-fab2-btn building-fab2-btn-small');
        this.mergeBtn.dataset.action = 'silhouette:merge';
        this.deleteBtn = makeButton('Delete', 'building-fab2-btn building-fab2-btn-small building-fab2-btn-danger');
        this.deleteBtn.dataset.action = 'silhouette:delete';
        this.toolbar.appendChild(this.splitBtn);
        this.toolbar.appendChild(this.mergeBtn);
        this.toolbar.appendChild(this.deleteBtn);

        this.canvasShell = document.createElement('div');
        this.canvasShell.className = 'building-fab2-silhouette-canvas-shell';
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'building-fab2-silhouette-canvas';
        this.canvas.dataset.role = 'silhouette-plan';
        this.canvas.tabIndex = 0;
        this.canvas.setAttribute('aria-label', 'Editable floor silhouette plan');
        this.canvasShell.appendChild(this.canvas);
        this.canvasHud = document.createElement('div');
        this.canvasHud.className = 'building-fab2-silhouette-canvas-hud';
        this.canvasHint = document.createElement('span');
        this.canvasHint.dataset.role = 'silhouette:canvas-hint';
        this.canvasHud.appendChild(this.canvasHint);
        this.canvasShell.appendChild(this.canvasHud);
        this.legend = document.createElement('div');
        this.legend.className = 'building-fab2-silhouette-legend';
        for (const [className, label] of [
            ['is-stretchable', 'Stretchable'],
            ['is-pinned', 'Pinned'],
            ['is-ghost', 'Other floor layer'],
            ['is-minimum', 'Bay minimum']
        ]) {
            const item = document.createElement('span');
            item.className = 'building-fab2-silhouette-legend-item';
            const swatch = document.createElement('i');
            swatch.className = `building-fab2-silhouette-legend-swatch ${className}`;
            item.appendChild(swatch);
            item.append(label);
            this.legend.appendChild(item);
        }

        this.previewBar = document.createElement('div');
        this.previewBar.className = 'building-fab2-silhouette-preview-bar';
        const ghostsToggle = makeToggle('Show all floor layers', 'silhouette:ghost-neighbors');
        this.ghostToggle = ghostsToggle.input;
        this.previewBar.appendChild(ghostsToggle.label);
        const lotFitToggle = makeToggle('Simulated lot fit', 'silhouette:lot-fit-enabled');
        this.lotFitToggle = lotFitToggle.input;
        this.previewBar.appendChild(lotFitToggle.label);
        const lotWidth = makeNumberField('Lot W', 'silhouette:lot-width', { min: 1, step: 0.5, suffix: 'm' });
        this.lotWidthInput = lotWidth.input;
        this.previewBar.appendChild(lotWidth.label);
        const lotDepth = makeNumberField('Lot D', 'silhouette:lot-depth', { min: 1, step: 0.5, suffix: 'm' });
        this.lotDepthInput = lotDepth.input;
        this.previewBar.appendChild(lotDepth.label);
        this.fitStatus = document.createElement('span');
        this.fitStatus.className = 'building-fab2-silhouette-fit-status';
        this.fitStatus.dataset.role = 'silhouette:fit-status';
        this.previewBar.appendChild(this.fitStatus);

        this.workspace.appendChild(this.toolbar);
        this.workspace.appendChild(this.canvasShell);
        this.workspace.appendChild(this.legend);
        this.workspace.appendChild(this.previewBar);

        this.inspector = document.createElement('aside');
        this.inspector.className = 'building-fab2-silhouette-inspector';
        this.selectionSection = this._createInspectorSection('Selection', 'silhouette:selection');
        this.selectionSummary = document.createElement('div');
        this.selectionSummary.className = 'building-fab2-silhouette-selection-summary';
        this.selectionSummary.dataset.role = 'silhouette:selection-summary';
        this.selectionSection.body.appendChild(this.selectionSummary);
        this.selectionFields = document.createElement('div');
        this.selectionFields.className = 'building-fab2-silhouette-selection-fields';
        this.selectionSection.body.appendChild(this.selectionFields);

        this.sizeSection = this._createInspectorSection('Default design size', 'silhouette:preferred-size');
        const preferredWidth = makeNumberField('Preferred width', 'silhouette:preferred-width', { min: 0.1, step: 0.1, suffix: 'm' });
        this.preferredWidthInput = preferredWidth.input;
        const preferredDepth = makeNumberField('Preferred depth', 'silhouette:preferred-depth', { min: 0.1, step: 0.1, suffix: 'm' });
        this.preferredDepthInput = preferredDepth.input;
        this.sizeSection.body.appendChild(preferredWidth.label);
        this.sizeSection.body.appendChild(preferredDepth.label);
        const sizeHint = document.createElement('div');
        sizeHint.className = 'building-fab2-hint';
        sizeHint.textContent = 'Preferred size re-solves named stretch bands; physical bay widths are not uniformly scaled.';
        this.sizeSection.body.appendChild(sizeHint);

        this.validationSection = this._createInspectorSection('Validation', 'silhouette:validation');
        this.validationSummary = document.createElement('div');
        this.validationSummary.className = 'building-fab2-silhouette-validation-summary';
        this.validationSummary.dataset.role = 'silhouette:validation-summary';
        this.validationList = document.createElement('div');
        this.validationList.className = 'building-fab2-silhouette-validation-list';
        this.validationList.dataset.role = 'silhouette:validation-list';
        this.validationSection.body.appendChild(this.validationSummary);
        this.validationSection.body.appendChild(this.validationList);

        this.remapSection = this._createInspectorSection('Topology remap review', 'silhouette:remap');
        this.remapSection.root.classList.add('hidden');
        this.remapList = document.createElement('div');
        this.remapList.className = 'building-fab2-silhouette-remap-list';
        this.remapList.dataset.role = 'silhouette:remap-list';
        this.remapSection.body.appendChild(this.remapList);

        this.inspector.appendChild(this.selectionSection.root);
        this.inspector.appendChild(this.sizeSection.root);
        this.inspector.appendChild(this.validationSection.root);
        this.inspector.appendChild(this.remapSection.root);
        this.body.appendChild(this.workspace);
        this.body.appendChild(this.inspector);

        this.footer = document.createElement('footer');
        this.footer.className = 'building-fab2-silhouette-footer';
        this.footerMessage = document.createElement('div');
        this.footerMessage.className = 'building-fab2-hint building-fab2-silhouette-footer-message';
        this.footerMessage.dataset.role = 'silhouette:footer-message';
        const footerActions = document.createElement('div');
        footerActions.className = 'building-fab2-silhouette-footer-actions';
        this.cancelBtn = makeButton('Cancel');
        this.cancelBtn.dataset.action = 'silhouette:cancel';
        this.applyBtn = makeButton('Apply', 'building-fab2-btn building-fab2-btn-primary');
        this.applyBtn.dataset.action = 'silhouette:apply';
        footerActions.appendChild(this.cancelBtn);
        footerActions.appendChild(this.applyBtn);
        this.footer.appendChild(this.footerMessage);
        this.footer.appendChild(footerActions);

        this.panel.appendChild(this.header);
        this.panel.appendChild(this.sourceBar);
        this.panel.appendChild(this.body);
        this.panel.appendChild(this.footer);

        this._open = false;
        this._settled = false;
        this._applying = false;
        this._layerId = '';
        this._baseDocument = null;
        this._workingDocument = null;
        this._inheritedDescriptor = null;
        this._resolvedInheritedDocument = null;
        this._sourceMode = SOURCE_MODE.DEFAULT;
        this._sourceDocuments = {};
        this._ghosts = [];
        this._constraints = {};
        this._providedIssues = [];
        this._callbackIssues = [];
        this._issues = [];
        this._remapReport = null;
        this._remapRows = [];
        this._previewResult = null;
        this._selection = null;
        this._hover = null;
        this._tool = TOOL.SELECT;
        this._history = [];
        this._redo = [];
        this._drag = null;
        this._viewTransform = null;
        this._onPreview = null;
        this._onApply = null;
        this._onCancel = null;
        this._validate = null;
        this._resolvePreview = null;
        this._resizeObserver = null;
        this._sessionSerial = 0;
        this._previewRequestId = 0;
        this._validationRequestId = 0;
        this._identityLedger = null;

        this._onOverlayClick = (event) => {
            if (event.target === this.overlay) this.cancel();
        };
        this._onPanelClick = (event) => this._handlePanelClick(event);
        this._onPanelChange = (event) => this._handlePanelChange(event);
        this._onKeyDown = (event) => this._handleKeyDown(event);
        this._onPointerDown = (event) => this._handlePointerDown(event);
        this._onPointerMove = (event) => this._handlePointerMove(event);
        this._onPointerUp = (event) => this._finishPointerDrag(event);
        this._onPointerCancel = () => this._finishPointerDrag(null);
        this._onPointerLeave = () => {
            if (this._drag) return;
            this._hover = null;
            this._drawCanvas();
        };
    }

    _createInspectorSection(title, role) {
        const root = document.createElement('section');
        root.className = 'building-fab2-silhouette-inspector-section';
        root.dataset.role = role;
        const heading = document.createElement('div');
        heading.className = 'building-fab2-subtitle building-fab2-silhouette-inspector-title';
        heading.textContent = title;
        const body = document.createElement('div');
        body.className = 'building-fab2-silhouette-inspector-body';
        root.appendChild(heading);
        root.appendChild(body);
        return { root, body };
    }

    isOpen() {
        return this._open && this.overlay.isConnected && !this.overlay.classList.contains('hidden');
    }

    open({
        layerId = '',
        layerLabel = '',
        sourceMode = null,
        initialDocument = null,
        resolvedDocument = null,
        sourceDocuments = null,
        neighboringDocuments = null,
        constraints = null,
        validationIssues = null,
        remapReport = null,
        preferredWidthMeters = null,
        preferredDepthMeters = null,
        lotWidthMeters = DEFAULT_PREVIEW_SIZE_METERS,
        lotDepthMeters = DEFAULT_PREVIEW_SIZE_METERS,
        showNeighborGhosts = true,
        lotFitEnabled = false,
        resolveContext = null,
        validate = null,
        resolvePreview = null,
        onPreview = null,
        onApply = null,
        onCancel = null
    } = {}) {
        if (this.isOpen()) this.close({ notifyCancel: true });

        this._sessionSerial += 1;
        this._open = true;
        this._settled = false;
        this._applying = false;
        this._layerId = String(layerId ?? '');
        this._layerLabel = String(layerLabel ?? '');
        this._sourceDocuments = cloneValue(sourceDocuments ?? {});
        this._resolveContext = cloneValue(resolveContext ?? {});
        this._previousSourceAvailable = !!(
            this._sourceDocuments?.previous?.loop?.length >= 3
            || this._resolveContext?.previousResolved?.loop?.length >= 3
        );
        this._constraints = cloneValue(constraints ?? {});
        this._providedIssues = validationEntries(cloneValue(validationIssues)).map(normalizeIssue);
        this._callbackIssues = [];
        this._ghosts = normalizeGhosts(neighboringDocuments);
        this._validate = typeof validate === 'function' ? validate : null;
        this._resolvePreview = typeof resolvePreview === 'function' ? resolvePreview : null;
        this._onPreview = typeof onPreview === 'function' ? onPreview : null;
        this._onApply = typeof onApply === 'function' ? onApply : null;
        this._onCancel = typeof onCancel === 'function' ? onCancel : null;
        this._previewRequestId += 1;
        this._validationRequestId += 1;

        const initialInput = sourceMode === SOURCE_MODE.DETACHED && initialDocument?.loop?.length
            ? { ...cloneValue(initialDocument), mode: SOURCE_MODE.DETACHED }
            : initialDocument;
        const initial = safeNormalizeDocument(initialInput);
        const requestedMode = sourceMode ?? initial?.mode ?? SOURCE_MODE.DEFAULT;
        this._sourceMode = Object.values(SOURCE_MODE).includes(requestedMode) ? requestedMode : SOURCE_MODE.DEFAULT;
        this._inheritedDescriptor = initial?.mode !== SOURCE_MODE.DETACHED
            ? cloneDocument(initial)
            : normalizeLayerSilhouette({ version: 1, mode: this._sourceMode });
        this._resolvedInheritedDocument = this._resolveInheritedDocument(resolvedDocument);
        this._workingDocument = this._sourceMode === SOURCE_MODE.DETACHED
            ? (initial?.loop?.length >= 3 ? cloneDocument(initial) : this._createDetachedDocument(this._resolvedInheritedDocument, this._inheritedDescriptor))
            : null;
        this._baseDocument = cloneDocument(this._workingDocument ?? this._resolvedInheritedDocument ?? initial);
        this._identityLedger = { cornerIds: new Set(), runIds: new Set(), nextCornerSerial: 1 };
        this._rememberDocumentIdentities(this._baseDocument);
        this._rememberDocumentIdentities(this._workingDocument);
        this._rememberDocumentIdentities(this._resolvedInheritedDocument);
        this._remapReport = cloneValue(remapReport);
        this._remapRows = remapEntriesFromReport(this._remapReport);
        this._updateRemapReport();
        this._selection = null;
        this._hover = null;
        this._tool = TOOL.SELECT;
        this._history = [];
        this._redo = [];
        this._drag = null;
        this._viewTransform = null;
        this._previewResult = null;
        this._previewSettings = {
            showNeighborGhosts: showNeighborGhosts !== false,
            lotFitEnabled: lotFitEnabled === true,
            lotWidthMeters: clamp(lotWidthMeters, 1, 10000, DEFAULT_PREVIEW_SIZE_METERS),
            lotDepthMeters: clamp(lotDepthMeters, 1, 10000, DEFAULT_PREVIEW_SIZE_METERS)
        };

        if (this._workingDocument) {
            const preferred = this._workingDocument.preferredSize ?? {};
            const width = Number(preferredWidthMeters ?? preferred.widthMeters ?? preferred.width);
            const depth = Number(preferredDepthMeters ?? preferred.depthMeters ?? preferred.depth);
            if (Number.isFinite(width) || Number.isFinite(depth)) {
                this._workingDocument = normalizeLayerSilhouette({
                    ...cloneDocument(this._workingDocument),
                    preferredSize: {
                        widthMeters: Number.isFinite(width) ? Math.max(0.1, width) : undefined,
                        depthMeters: Number.isFinite(depth) ? Math.max(0.1, depth) : undefined
                    }
                });
            }
        }

        this.titleEl.textContent = this._layerLabel ? `Draw ${this._layerLabel} silhouette` : 'Draw floor silhouette';
        this.subtitleEl.textContent = 'Edit a private working copy. Apply commits the whole shape as one change.';
        this.footerMessage.textContent = '';
        this.sourceSelect.value = this._sourceMode;
        this.ghostToggle.checked = this._previewSettings.showNeighborGhosts;
        this.lotFitToggle.checked = this._previewSettings.lotFitEnabled;
        this.lotWidthInput.value = String(this._previewSettings.lotWidthMeters);
        this.lotDepthInput.value = String(this._previewSettings.lotDepthMeters);

        if (!this.overlay.isConnected) document.body.appendChild(this.overlay);
        this.overlay.classList.remove('hidden');
        this.overlay.addEventListener('click', this._onOverlayClick);
        this.panel.addEventListener('click', this._onPanelClick);
        this.panel.addEventListener('change', this._onPanelChange);
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        this.canvas.addEventListener('pointerdown', this._onPointerDown);
        this.canvas.addEventListener('pointermove', this._onPointerMove);
        this.canvas.addEventListener('pointerup', this._onPointerUp);
        this.canvas.addEventListener('pointercancel', this._onPointerCancel);
        this.canvas.addEventListener('pointerleave', this._onPointerLeave);
        if (typeof ResizeObserver === 'function') {
            this._resizeObserver = new ResizeObserver(() => this._drawCanvas());
            this._resizeObserver.observe(this.canvasShell);
        }

        this._refreshAll({ emitPreview: true });
        requestAnimationFrame(() => {
            if (!this.isOpen()) return;
            this._drawCanvas();
            this.canvas.focus({ preventScroll: true });
        });
        return this;
    }

    getWorkingDocument() {
        return cloneDocument(this._resultDocument());
    }

    setExternalState({
        validationIssues,
        remapReport,
        neighboringDocuments,
        resolvedDocument,
        previewResult
    } = {}) {
        if (validationIssues !== undefined) {
            this._providedIssues = validationEntries(cloneValue(validationIssues)).map(normalizeIssue);
        }
        if (remapReport !== undefined) {
            this._remapReport = cloneValue(remapReport);
            this._remapRows = remapEntriesFromReport(this._remapReport);
        }
        if (neighboringDocuments !== undefined) this._ghosts = normalizeGhosts(neighboringDocuments);
        if (resolvedDocument !== undefined) this._resolvedInheritedDocument = safeNormalizeDocument(resolvedDocument);
        if (previewResult !== undefined) this._previewResult = cloneValue(previewResult);
        this._refreshAll({ emitPreview: false, resolvePreview: previewResult === undefined });
    }

    cancel() {
        if (!this.isOpen() || this._settled || this._applying) return;
        this._settled = true;
        const callback = this._onCancel;
        const context = this._callbackContext();
        this.close({ notifyCancel: false });
        callback?.(context);
    }

    close({ notifyCancel = true } = {}) {
        if (notifyCancel && this.isOpen() && !this._settled && !this._applying) {
            this.cancel();
            return;
        }
        if (this._applying) this._settled = true;
        this._open = false;
        this.overlay.classList.add('hidden');
        this.overlay.removeEventListener('click', this._onOverlayClick);
        this.panel.removeEventListener('click', this._onPanelClick);
        this.panel.removeEventListener('change', this._onPanelChange);
        window.removeEventListener('keydown', this._onKeyDown);
        this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        this.canvas.removeEventListener('pointermove', this._onPointerMove);
        this.canvas.removeEventListener('pointerup', this._onPointerUp);
        this.canvas.removeEventListener('pointercancel', this._onPointerCancel);
        this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this._previewRequestId += 1;
        this._validationRequestId += 1;
        this._drag = null;
        this._onPreview = null;
        this._onApply = null;
        this._onCancel = null;
        this._validate = null;
        this._resolvePreview = null;
    }

    dispose() {
        this.close({ notifyCancel: true });
        this.overlay.remove();
    }

    _resolveInheritedDocument(explicitResolved) {
        const directSource = explicitResolved?.silhouette?.mode === SOURCE_MODE.DETACHED
            ? explicitResolved.silhouette
            : (Array.isArray(explicitResolved?.loop)
                ? createDetachedLayerSilhouette(explicitResolved.loop)
                : explicitResolved);
        const direct = safeNormalizeDocument(directSource);
        if (direct?.loop?.length >= 3) return direct;
        const source = this._sourceDocuments?.[this._sourceMode]
            ?? (this._sourceMode === SOURCE_MODE.DEFAULT ? this._sourceDocuments?.default : this._sourceDocuments?.previous);
        const sourceDocument = safeNormalizeDocument(Array.isArray(source)
            ? createDetachedLayerSilhouette(source)
            : (Array.isArray(source?.loop) && source?.mode !== SOURCE_MODE.DETACHED
                ? createDetachedLayerSilhouette(source.loop)
                : source));
        if (sourceDocument?.loop?.length >= 3) return sourceDocument;
        try {
            const resolved = resolveLayerSilhouette({
                layer: {
                    id: this._layerId,
                    silhouette: { version: 1, mode: this._sourceMode }
                },
                defaultLoop: cloneValue(this._resolveContext?.defaultLoop ?? this._sourceDocuments?.default ?? []),
                previousResolved: cloneValue(this._resolveContext?.previousResolved ?? this._sourceDocuments?.previousResolved ?? null)
            });
            const documentValue = Array.isArray(resolved?.loop)
                ? safeNormalizeDocument(createDetachedLayerSilhouette(resolved.loop))
                : safeNormalizeDocument(resolved?.silhouette ?? resolved);
            if (documentValue?.loop?.length >= 3) return documentValue;
        } catch {
            // Integrators can pass resolvedDocument when the building resolver needs more context.
        }
        try {
            const resolved = resolveBuildingLayerSilhouettes({
                layers: cloneValue(this._resolveContext?.layers ?? []),
                footprintLoops: cloneValue(this._resolveContext?.footprintLoops ?? [])
            });
            const byLayer = resolved?.byLayerId ?? resolved?.layers ?? resolved;
            const entry = byLayer instanceof Map ? byLayer.get(this._layerId) : byLayer?.[this._layerId];
            const documentValue = Array.isArray(entry?.loop)
                ? safeNormalizeDocument(createDetachedLayerSilhouette(entry.loop))
                : safeNormalizeDocument(entry?.silhouette ?? entry);
            if (documentValue?.loop?.length >= 3) return documentValue;
        } catch {
            // The popup remains usable once a resolved source is supplied.
        }
        return null;
    }

    _createDetachedDocument(source, descriptor = null) {
        try {
            if (!source?.loop?.length) return null;
            return safeNormalizeDocument(createDetachedLayerSilhouette(source.loop, {
                preferredSize: descriptor?.preferredSize ?? source.preferredSize ?? null,
                stretchBands: descriptor?.stretchBands ?? source.stretchBands,
                stretchProvenance: descriptor?.stretchProvenance ?? source.stretchProvenance ?? null,
                targetRemap: descriptor?.targetRemap ?? source.targetRemap ?? null,
                sourceLayerId: descriptor?.sourceLayerId ?? source.sourceLayerId ?? null,
                idState: source.idState ?? null
            }));
        } catch {
            if (!source?.loop?.length) return null;
            return safeNormalizeDocument({ ...cloneDocument(source), version: 1, mode: SOURCE_MODE.DETACHED });
        }
    }

    _resultDocument() {
        if (this._sourceMode === SOURCE_MODE.DETACHED) return this._workingDocument;
        const descriptor = {
            ...cloneDocument(this._inheritedDescriptor),
            version: 1,
            mode: this._sourceMode
        };
        try {
            return unwrapDocument(normalizeLayerSilhouette(descriptor), 'normalize inherited source');
        } catch {
            return descriptor;
        }
    }

    _displayDocument() {
        if (this._sourceMode === SOURCE_MODE.DETACHED) return this._workingDocument;
        const resolved = this._resolvedInheritedDocument;
        if (!resolved?.loop?.length) return resolved;
        return createDetachedLayerSilhouette(resolved.loop, {
            preferredSize: this._inheritedDescriptor?.preferredSize ?? resolved.preferredSize ?? null,
            stretchBands: this._inheritedDescriptor?.stretchBands ?? resolved.stretchBands,
            stretchProvenance: this._inheritedDescriptor?.stretchProvenance ?? resolved.stretchProvenance ?? null,
            targetRemap: this._inheritedDescriptor?.targetRemap ?? resolved.targetRemap ?? null,
            sourceLayerId: this._inheritedDescriptor?.sourceLayerId ?? resolved.sourceLayerId ?? null,
            idState: resolved.idState ?? null
        });
    }

    _callbackContext(extra = {}) {
        return {
            layerId: this._layerId,
            layerLabel: this._layerLabel,
            sourceMode: this._sourceMode,
            resolvedDocument: cloneDocument(this._displayDocument()),
            previewSettings: cloneValue(this._previewSettings),
            previewResult: cloneValue(this._previewResult),
            remapReport: cloneValue(this._remapReport),
            remapDecisions: this._decisionsByTarget(),
            ...extra
        };
    }

    _captureSnapshot(label = '') {
        return {
            label,
            sourceMode: this._sourceMode,
            workingDocument: cloneDocument(this._workingDocument),
            inheritedDescriptor: cloneDocument(this._inheritedDescriptor),
            resolvedInheritedDocument: cloneDocument(this._resolvedInheritedDocument),
            remapReport: cloneValue(this._remapReport),
            remapRows: cloneValue(this._remapRows),
            selection: cloneValue(this._selection)
        };
    }

    _restoreSnapshot(snapshot) {
        this._rememberDocumentIdentities(this._workingDocument);
        this._sourceMode = snapshot.sourceMode;
        this._workingDocument = this._applyIdentityLedger(snapshot.workingDocument);
        this._inheritedDescriptor = cloneDocument(snapshot.inheritedDescriptor);
        this._resolvedInheritedDocument = cloneDocument(snapshot.resolvedInheritedDocument);
        this._remapReport = cloneValue(snapshot.remapReport);
        this._remapRows = cloneValue(snapshot.remapRows ?? []);
        this._selection = cloneValue(snapshot.selection);
        this._drag = null;
    }

    _snapshotChanged(before, after) {
        return stableSerialize({
            sourceMode: before.sourceMode,
            workingDocument: before.workingDocument,
            remapRows: before.remapRows
        }) !== stableSerialize({
            sourceMode: after.sourceMode,
            workingDocument: after.workingDocument,
            remapRows: after.remapRows
        });
    }

    _recordSnapshot(before, label) {
        const current = this._captureSnapshot(label);
        if (!this._snapshotChanged(before, current)) return false;
        this._history.push({ ...before, label });
        if (this._history.length > HISTORY_LIMIT) this._history.shift();
        this._redo = [];
        this._rememberDocumentIdentities(this._workingDocument);
        return true;
    }

    _rememberDocumentIdentities(documentValue) {
        if (!this._identityLedger || !documentValue?.loop?.length) return;
        for (const point of documentValue.loop) {
            if (point?.cornerId) this._identityLedger.cornerIds.add(point.cornerId);
            if (point?.runId) this._identityLedger.runIds.add(point.runId);
        }
        for (const id of documentValue.idState?.retiredCornerIds ?? []) this._identityLedger.cornerIds.add(id);
        for (const id of documentValue.idState?.retiredRunIds ?? []) this._identityLedger.runIds.add(id);
        this._identityLedger.nextCornerSerial = Math.max(
            this._identityLedger.nextCornerSerial,
            Number(documentValue.idState?.nextCornerSerial) || 1
        );
    }

    _applyIdentityLedger(documentValue) {
        const next = cloneDocument(documentValue);
        if (!next?.loop?.length || !this._identityLedger) return next;
        const activeCorners = new Set(next.loop.map((point) => point.cornerId));
        const activeRuns = new Set(next.loop.map((point) => point.runId));
        next.idState = {
            nextCornerSerial: Math.max(Number(next.idState?.nextCornerSerial) || 1, this._identityLedger.nextCornerSerial),
            retiredCornerIds: [...new Set([
                ...(next.idState?.retiredCornerIds ?? []),
                ...[...this._identityLedger.cornerIds].filter((id) => !activeCorners.has(id))
            ])].filter((id) => !activeCorners.has(id)).sort(),
            retiredRunIds: [...new Set([
                ...(next.idState?.retiredRunIds ?? []),
                ...[...this._identityLedger.runIds].filter((id) => !activeRuns.has(id))
            ])].filter((id) => !activeRuns.has(id)).sort()
        };
        return next;
    }

    _undo() {
        if (this._applying || !this._history.length) return;
        const previous = this._history.pop();
        this._redo.push(this._captureSnapshot(previous.label));
        this._restoreSnapshot(previous);
        this._refreshAll({ emitPreview: true });
    }

    _redoOperation() {
        if (this._applying || !this._redo.length) return;
        const next = this._redo.pop();
        this._history.push(this._captureSnapshot(next.label));
        this._restoreSnapshot(next);
        this._refreshAll({ emitPreview: true });
    }

    _refreshAll({ emitPreview = false, resolvePreview = true } = {}) {
        this._pruneSelection();
        this._renderSource();
        this._renderToolbar();
        this._renderPreferredSize();
        this._renderSelection();
        this._runValidation();
        this._renderRemap();
        this._renderHistory();
        this._renderPreviewControls();
        this._drawCanvas();
        if (resolvePreview) this._refreshPreviewResult();
        if (emitPreview) this._emitPreview();
    }

    _renderSource() {
        this.sourceSelect.value = this._sourceMode;
        this.sourceValue.textContent = sourceLabel(this._sourceMode);
        const previousOption = this.sourceOptions.get(SOURCE_MODE.PREVIOUS);
        if (previousOption) {
            previousOption.disabled = !this._previousSourceAvailable;
            previousOption.title = this._previousSourceAvailable
                ? ''
                : 'The first floor layer has no previous layer to inherit.';
        }
        const detached = this._sourceMode === SOURCE_MODE.DETACHED;
        this.detachBtn.classList.toggle('hidden', detached);
        this.detachBtn.disabled = detached || !this._resolvedInheritedDocument?.loop?.length || this._applying;
        this.sourceSelect.disabled = this._applying;
        this.panel.classList.toggle('is-inherited', !detached);
    }

    _renderToolbar() {
        const editable = this._sourceMode === SOURCE_MODE.DETACHED && !!this._workingDocument?.loop?.length && !this._applying;
        this.panel.dataset.tool = this._tool;
        for (const [tool, button] of this.toolButtons) {
            button.disabled = !editable;
            button.classList.toggle('is-active', tool === this._tool);
            button.setAttribute('aria-pressed', tool === this._tool ? 'true' : 'false');
        }
        const faceSelected = this._selection?.type === 'run';
        const cornerSelected = this._selection?.type === 'corner';
        const loopLength = this._workingDocument?.loop?.length ?? 0;
        this.splitBtn.disabled = !editable || !faceSelected;
        this.mergeBtn.disabled = !editable || (!faceSelected && !cornerSelected) || loopLength <= 3;
        this.deleteBtn.disabled = !editable || (!faceSelected && !cornerSelected) || loopLength <= 3;
    }

    _renderHistory() {
        this.undoBtn.disabled = this._applying || !this._history.length;
        this.redoBtn.disabled = this._applying || !this._redo.length;
        this.historyStatus.textContent = this._history.length ? `${this._history.length} edit${this._history.length === 1 ? '' : 's'}` : 'No local edits';
    }

    _pruneSelection() {
        const documentValue = this._displayDocument();
        if (!this._selection || !documentValue?.loop?.length) {
            this._selection = null;
            return;
        }
        if (this._selection.type === 'corner' && !getCornerById(documentValue, this._selection.id)) this._selection = null;
        if (this._selection.type === 'run' && !getRunById(documentValue, this._selection.id)) this._selection = null;
    }

    _renderPreferredSize() {
        const documentValue = this._displayDocument();
        const preferred = documentValue?.preferredSize ?? {};
        this.preferredWidthInput.value = Number.isFinite(Number(preferred.widthMeters)) ? String(preferred.widthMeters) : '';
        this.preferredDepthInput.value = Number.isFinite(Number(preferred.depthMeters)) ? String(preferred.depthMeters) : '';
        const disabled = this._sourceMode !== SOURCE_MODE.DETACHED || this._applying;
        this.preferredWidthInput.disabled = disabled;
        this.preferredDepthInput.disabled = disabled;
    }

    _renderSelection() {
        this.selectionFields.replaceChildren();
        const documentValue = this._displayDocument();
        const editable = this._sourceMode === SOURCE_MODE.DETACHED && !this._applying;
        if (!this._selection || !documentValue?.loop?.length) {
            this.selectionSummary.textContent = editable
                ? 'Select a corner or face in the plan.'
                : 'This layer is inherited. Detach it to edit geometry.';
            return;
        }

        if (this._selection.type === 'corner') {
            const corner = getCornerById(documentValue, this._selection.id);
            if (!corner) return;
            this.selectionSummary.textContent = `Corner ${corner.index + 1} · ${corner.point.cornerId}`;
            const grid = document.createElement('div');
            grid.className = 'building-fab2-silhouette-field-grid';
            const x = makeNumberField('X position', 'silhouette:corner-x', { step: 0.05, suffix: 'm' });
            const z = makeNumberField('Z position', 'silhouette:corner-z', { step: 0.05, suffix: 'm' });
            x.input.value = Number(corner.point.x).toFixed(2);
            z.input.value = Number(corner.point.z).toFixed(2);
            x.input.disabled = !editable;
            z.input.disabled = !editable;
            grid.appendChild(x.label);
            grid.appendChild(z.label);
            this.selectionFields.appendChild(grid);
            const hint = document.createElement('div');
            hint.className = 'building-fab2-hint';
            hint.textContent = `Ends face ${documentValue.loop[(corner.index - 1 + documentValue.loop.length) % documentValue.loop.length].runId} and starts face ${corner.point.runId}.`;
            this.selectionFields.appendChild(hint);
            return;
        }

        const run = getRunById(documentValue, this._selection.id);
        if (!run) return;
        const metrics = getRunMetricsSafe(documentValue, this._selection.id);
        const curve = resolveFootprintArcRun(run.start, run.end, run.start.arc);
        const midpoint = curve
            ? sampleResolvedFootprintArc(curve, curve.length * 0.5)
            : { x: (Number(run.start.x) + Number(run.end.x)) * 0.5, z: (Number(run.start.z) + Number(run.end.z)) * 0.5 };
        const perimeter = documentValue.loop.reduce((sum, point) => sum + Number(getRunMetricsSafe(documentValue, point.runId)?.length ?? 0), 0);
        const relativeSpan = perimeter > 1e-8 ? Number(metrics.length ?? 0) / perimeter * 100 : 0;
        this.selectionSummary.textContent = `Face ${run.start.runId} · ${formatMeters(metrics.length)}`;

        const positionGrid = document.createElement('div');
        positionGrid.className = 'building-fab2-silhouette-field-grid';
        const centerX = makeNumberField('Face center X', 'silhouette:run-center-x', { step: 0.05, suffix: 'm' });
        const centerZ = makeNumberField('Face center Z', 'silhouette:run-center-z', { step: 0.05, suffix: 'm' });
        centerX.input.value = Number(midpoint?.x ?? 0).toFixed(2);
        centerZ.input.value = Number(midpoint?.z ?? 0).toFixed(2);
        centerX.input.disabled = !editable;
        centerZ.input.disabled = !editable;
        positionGrid.appendChild(centerX.label);
        positionGrid.appendChild(centerZ.label);
        this.selectionFields.appendChild(positionGrid);

        const span = makeNumberField('Relative perimeter span', 'silhouette:run-span', { min: 0.01, max: 49.5, step: 0.1, suffix: '%' });
        span.input.value = relativeSpan.toFixed(2);
        span.input.disabled = !editable;
        this.selectionFields.appendChild(span.label);

        const shape = appendSelectField(this.selectionFields, 'Geometry', 'silhouette:run-shape', [
            ['straight', 'Straight'],
            ['curved', 'Circular arc']
        ]);
        shape.value = curve ? 'curved' : 'straight';
        shape.disabled = !editable;

        if (curve) {
            const outwardSign = signedArea(documentValue.loop) >= 0 ? -1 : 1;
            const direction = appendSelectField(this.selectionFields, 'Curve direction', 'silhouette:arc-direction', [
                ['outward', 'Outward'],
                ['inward', 'Inward']
            ]);
            direction.value = Math.sign(curve.sweep) === outwardSign ? 'outward' : 'inward';
            direction.disabled = !editable;
            const arcGrid = document.createElement('div');
            arcGrid.className = 'building-fab2-silhouette-field-grid';
            const sweep = makeNumberField('Sweep', 'silhouette:arc-sweep', {
                min: ARC_SWEEP_MIN_DEGREES,
                max: ARC_SWEEP_MAX_DEGREES,
                step: 1,
                suffix: '°'
            });
            const radius = makeNumberField('Radius', 'silhouette:arc-radius', {
                min: Math.max(MIN_RUN_LENGTH_METERS, Number(metrics.chordLength ?? 0) * 0.5),
                step: 0.05,
                suffix: 'm'
            });
            sweep.input.value = Math.abs(Number(metrics.sweepRadians ?? curve.sweep) * 180 / Math.PI).toFixed(1);
            radius.input.value = Number(metrics.radius ?? curve.radius).toFixed(2);
            sweep.input.disabled = !editable;
            radius.input.disabled = !editable;
            arcGrid.appendChild(sweep.label);
            arcGrid.appendChild(radius.label);
            this.selectionFields.appendChild(arcGrid);
        }

        const startTangent = metrics.startTangent ?? metrics.tangentStart;
        const endTangent = metrics.endTangent ?? metrics.tangentEnd;
        const tangent = document.createElement('div');
        tangent.className = 'building-fab2-silhouette-tangent-feedback';
        tangent.dataset.role = 'silhouette:tangent-feedback';
        tangent.textContent = `Tangents  start ${this._formatVector(startTangent)}  ·  end ${this._formatVector(endTangent)}`;
        this.selectionFields.appendChild(tangent);

        const bandState = this._runBandState(run.start.runId);
        const bandMode = appendSelectField(this.selectionFields, 'Runtime lot fitting', 'silhouette:band-mode', [
            ['pinned', 'Pinned / fixed'],
            ['stretchable', 'Stretchable'],
            ['prefer_expand', 'Prefer expansion']
        ]);
        bandMode.value = bandState;
        bandMode.disabled = !editable || !!curve;
        const bandHint = document.createElement('div');
        bandHint.className = `building-fab2-silhouette-band-indicator is-${bandState === 'pinned' ? 'pinned' : 'stretchable'}`;
        bandHint.dataset.role = 'silhouette:band-indicator';
        bandHint.textContent = curve
            ? 'Pinned: curved faces keep their authored radius and endpoints during lot fitting.'
            : (bandState === 'pinned'
            ? 'Pinned: lot fitting preserves this face.'
            : 'Named end bands can absorb a compatible lot-fit delta.');
        this.selectionFields.appendChild(bandHint);
    }

    _formatVector(vector) {
        const x = Number(vector?.x);
        const z = Number(vector?.z);
        return Number.isFinite(x) && Number.isFinite(z) ? `(${x.toFixed(2)}, ${z.toFixed(2)})` : '—';
    }

    _runBandState(runId) {
        const documentValue = this._sourceMode === SOURCE_MODE.DETACHED ? this._workingDocument : this._displayDocument();
        const run = getRunById(documentValue, runId);
        if (run?.start?.arc !== undefined) return 'pinned';
        const bands = Array.isArray(documentValue?.stretchBands) ? documentValue.stretchBands : [];
        const matching = bands.filter((band) => band?.runId === runId);
        if (!matching.some((band) => band?.stretchable !== false && band?.preference !== 'never')) return 'pinned';
        return matching.some((band) => band?.preference === 'prefer_expand') ? 'prefer_expand' : 'stretchable';
    }

    _runValidation() {
        const documentValue = this._displayDocument();
        let domainIssues = [];
        if (this._sourceMode === SOURCE_MODE.PREVIOUS && !this._previousSourceAvailable) {
            domainIssues = [{
                severity: 'error',
                code: 'previous_source_unavailable',
                message: 'The first floor layer cannot inherit a previous layer. Choose the building default or detach it.'
            }];
        } else if (!documentValue?.loop?.length) {
            domainIssues = [{ severity: 'error', code: 'missing_source', message: 'This inheritance source has no resolved silhouette.' }];
        } else {
            try {
                const remapForValidation = this._resolveRemapDecisions();
                const remappedDocument = this._materializeRemappedDocument(documentValue, remapForValidation);
                const validationDocument = this._sourceMode === SOURCE_MODE.DETACHED && this._remapReport
                    ? normalizeLayerSilhouette({
                        ...remappedDocument,
                        targetRemap: {
                            ...cloneValue(remapForValidation.targetRemap),
                            unresolved: []
                        }
                    })
                    : documentValue;
                const validation = validateLayerSilhouette(validationDocument, {
                    layerId: this._layerId || null,
                    minRunLengths: this._constraints?.minRunLengths ?? null,
                    targetIssues: this._constraints?.targetIssues ?? [],
                    neighboringLoops: Array.isArray(this._constraints?.neighboringLoops)
                        ? this._constraints.neighboringLoops
                        : this._ghosts.map((ghost) => ghost.loop),
                    requireClockwise: this._constraints?.requireClockwise !== false
                });
                domainIssues = validationEntries(validation).map(normalizeIssue);
            } catch (error) {
                domainIssues = [{
                    severity: 'error',
                    code: 'validation_failed',
                    message: error instanceof Error ? error.message : String(error)
                }];
            }
        }
        const remapResolution = this._resolveRemapDecisions();
        const remapIssues = (remapResolution?.unresolved ?? []).map((entry, index) => ({
            severity: 'error',
            code: `unresolved_remap_${index}`,
            target: entry?.targetId ?? '',
            message: `Choose how to handle ${entry?.kind ?? 'target'} ${entry?.targetId ?? ''} before applying.`
        }));
        this._issues = dedupeIssues([...domainIssues, ...this._providedIssues, ...this._callbackIssues, ...remapIssues]);
        this._renderValidation();

        if (!this._validate || !documentValue) return;
        const requestId = this._validationRequestId + 1;
        this._validationRequestId = requestId;
        const sessionSerial = this._sessionSerial;
        try {
            const callbackDocument = this._sourceMode === SOURCE_MODE.DETACHED
                ? this._materializeRemappedDocument(this._resultDocument())
                : cloneDocument(this._resultDocument());
            const extra = this._validate(callbackDocument, this._callbackContext({ phase: 'validate' }));
            if (extra && typeof extra.then === 'function') {
                Promise.resolve(extra).then((result) => {
                    if (!this.isOpen() || sessionSerial !== this._sessionSerial || requestId !== this._validationRequestId) return;
                    this._callbackIssues = validationEntries(result).map(normalizeIssue);
                    this._runValidationWithoutCallback();
                }).catch((error) => {
                    if (!this.isOpen() || sessionSerial !== this._sessionSerial || requestId !== this._validationRequestId) return;
                    this._callbackIssues = [{ severity: 'error', message: error instanceof Error ? error.message : String(error) }].map(normalizeIssue);
                    this._runValidationWithoutCallback();
                });
            } else if (extra !== undefined && sessionSerial === this._sessionSerial && requestId === this._validationRequestId) {
                this._callbackIssues = validationEntries(extra).map(normalizeIssue);
                this._runValidationWithoutCallback();
            }
        } catch (error) {
            this._callbackIssues = [{ severity: 'error', message: error instanceof Error ? error.message : String(error) }].map(normalizeIssue);
            this._runValidationWithoutCallback();
        }
    }

    _runValidationWithoutCallback() {
        const validate = this._validate;
        this._validate = null;
        this._runValidation();
        this._validate = validate;
    }

    _renderValidation() {
        const errors = this._issues.filter((issue) => issue.severity === 'error');
        const warnings = this._issues.filter((issue) => issue.severity === 'warning');
        this.validationSummary.className = `building-fab2-silhouette-validation-summary ${errors.length ? 'has-errors' : (warnings.length ? 'has-warnings' : 'is-valid')}`;
        this.validationSummary.textContent = errors.length
            ? `${errors.length} error${errors.length === 1 ? '' : 's'} block Apply`
            : (warnings.length ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'Silhouette is valid');
        this.validationList.replaceChildren();
        for (const issue of this._issues) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = `building-fab2-silhouette-validation-item is-${issue.severity}`;
            row.dataset.issueId = issue.id;
            if (issue.target) row.dataset.target = issue.target;
            const icon = document.createElement('span');
            icon.className = 'building-fab2-silhouette-validation-icon';
            icon.textContent = issue.severity === 'error' ? '×' : (issue.severity === 'warning' ? '!' : 'i');
            const message = document.createElement('span');
            message.textContent = `${issue.target ? `${issue.target}: ` : ''}${issue.message}`;
            row.appendChild(icon);
            row.appendChild(message);
            this.validationList.appendChild(row);
        }
        this.applyBtn.disabled = this._applying || errors.length > 0 || !this._resultDocument();
        this.cancelBtn.disabled = this._applying;
        this.applyBtn.textContent = this._applying ? 'Applying…' : 'Apply';
    }

    _decisionsByTarget() {
        const decisions = {};
        for (const row of this._remapRows) {
            if (!row?.decision) continue;
            decisions[row.id] = typeof row.decision === 'string' ? { action: row.decision } : cloneValue(row.decision);
        }
        return decisions;
    }

    _resolveRemapDecisions() {
        if (!this._remapReport) return { valid: true, resolved: [], unresolved: [] };
        try {
            return applySilhouetteRemapDecisions(this._remapReport, this._decisionsByTarget());
        } catch (error) {
            return { valid: false, resolved: [], unresolved: [{ targetId: 'remap', kind: 'target', reason: String(error) }] };
        }
    }

    _renderRemap() {
        const report = this._remapReport;
        const changed = !!report && ((report.addedRunIds?.length ?? 0) + (report.removedRunIds?.length ?? 0) > 0);
        const reviewRows = this._remapRows.filter((row) => row.status === 'needs_decision' || row.required || row.decision);
        this.remapSection.root.classList.toggle('hidden', !changed && !reviewRows.length);
        this.remapList.replaceChildren();
        if (!report) return;

        const summary = document.createElement('div');
        summary.className = 'building-fab2-silhouette-remap-summary';
        const added = report.addedRunIds?.length ? `Added ${report.addedRunIds.join(', ')}` : 'No added faces';
        const removed = report.removedRunIds?.length ? `Removed ${report.removedRunIds.join(', ')}` : 'No removed faces';
        summary.textContent = `${added} · ${removed}`;
        this.remapList.appendChild(summary);

        for (const rowData of reviewRows) {
            const row = document.createElement('div');
            row.className = 'building-fab2-silhouette-remap-row';
            row.dataset.remapId = rowData.id;
            const header = document.createElement('div');
            header.className = 'building-fab2-silhouette-remap-row-header';
            const label = document.createElement('strong');
            label.textContent = rowData.label;
            const kind = document.createElement('span');
            kind.textContent = rowData.kind;
            header.appendChild(label);
            header.appendChild(kind);
            const detail = document.createElement('div');
            detail.className = 'building-fab2-hint';
            detail.textContent = rowData.message || (rowData.missingRunIds?.length
                ? `Missing face ${rowData.missingRunIds.join(', ')}`
                : 'Target remains compatible.');
            row.appendChild(header);
            row.appendChild(detail);
            if (rowData.status === 'needs_decision' || rowData.required) {
                const actions = document.createElement('div');
                actions.className = 'building-fab2-silhouette-remap-actions';
                const action = appendSelectField(actions, 'Decision', 'silhouette:remap-action', [
                    ['', 'Choose…'],
                    [SILHOUETTE_REMAP_DECISION.REMAP, 'Remap to face'],
                    [SILHOUETTE_REMAP_DECISION.ORPHAN, 'Keep orphaned'],
                    [SILHOUETTE_REMAP_DECISION.REMOVE ?? SILHOUETTE_REMAP_DECISION.DISCARD, 'Remove target']
                ]);
                action.dataset.remapId = rowData.id;
                action.value = typeof rowData.decision === 'string' ? rowData.decision : (rowData.decision?.action ?? '');
                action.disabled = this._applying;
                const candidateIds = rowData.options.map((option) => typeof option === 'string' ? option : option?.runId).filter(Boolean);
                if (action.value === SILHOUETTE_REMAP_DECISION.REMAP) {
                    const affectedSourceIds = [...new Set([
                        ...(Array.isArray(rowData.missingRunIds) ? rowData.missingRunIds : []),
                        ...(Array.isArray(rowData.incompatibleRunIds) ? rowData.incompatibleRunIds : [])
                    ].filter((id) => typeof id === 'string' && id))];
                    const usesPerSourceTargets = rowData.kind === 'balcony_continuity_link'
                        && affectedSourceIds.length > 1;
                    const appendTarget = (sourceRunId = null) => {
                        const target = appendSelectField(
                            actions,
                            sourceRunId ? `New face for ${sourceRunId}` : 'New face',
                            'silhouette:remap-run',
                            [
                                ['', 'Choose face…'],
                                ...candidateIds.map((id) => [id, `Face ${id}`])
                            ]
                        );
                        target.dataset.remapId = rowData.id;
                        if (sourceRunId) target.dataset.sourceRunId = sourceRunId;
                        target.value = sourceRunId
                            ? (rowData.decision?.runIdsBySource?.[sourceRunId] ?? '')
                            : (rowData.decision?.runId ?? '');
                        target.disabled = this._applying;
                    };
                    if (usesPerSourceTargets) affectedSourceIds.forEach(appendTarget);
                    else appendTarget();
                }
                row.appendChild(actions);
            }
            this.remapList.appendChild(row);
        }
    }

    _renderPreviewControls() {
        const settings = this._previewSettings;
        this.ghostToggle.checked = settings.showNeighborGhosts;
        this.lotFitToggle.checked = settings.lotFitEnabled;
        this.lotWidthInput.disabled = !settings.lotFitEnabled || this._applying;
        this.lotDepthInput.disabled = !settings.lotFitEnabled || this._applying;
        const result = settings.lotFitEnabled ? this._previewResult : this._defaultPreviewResult;
        if (!result) this.fitStatus.textContent = settings.lotFitEnabled ? 'Fit preview unavailable' : 'Authored design frame';
        else if (result.exact === false) {
            const reason = result.issues?.[0]?.message ?? result.warnings?.[0] ?? '';
            this.fitStatus.textContent = reason ? `Nearest valid · ${reason}` : 'Nearest valid fit';
            this.fitStatus.title = reason;
        }
        else this.fitStatus.textContent = settings.lotFitEnabled ? 'Lot fit reached' : 'Default design preview';
        if (result?.exact !== false) this.fitStatus.removeAttribute('title');
        this.fitStatus.classList.toggle('is-warning', result?.exact === false);
    }

    _refreshPreviewResult() {
        const documentValue = this._displayDocument();
        if (!documentValue?.loop?.length) {
            this._previewResult = null;
            this._defaultPreviewResult = null;
            this._renderPreviewControls();
            return;
        }
        try {
            this._defaultPreviewResult = solveSilhouettePreferredSize({
                loop: documentValue.loop,
                preferredSize: documentValue.preferredSize,
                stretchBands: documentValue.stretchBands,
                minRunLengths: this._constraints?.minRunLengths ?? null
            });
            this._previewResult = this._previewSettings.lotFitEnabled
                ? solveSilhouettePreferredSize({
                    loop: documentValue.loop,
                    preferredSize: {
                        widthMeters: this._previewSettings.lotWidthMeters,
                        depthMeters: this._previewSettings.lotDepthMeters
                    },
                    stretchBands: documentValue.stretchBands,
                    minRunLengths: this._constraints?.minRunLengths ?? null,
                    seed: `silhouette-popup:${this._layerId || 'layer'}`
                })
                : null;
        } catch {
            this._defaultPreviewResult = null;
            this._previewResult = null;
        }
        this._renderPreviewControls();
        this._drawCanvas();

        if (!this._resolvePreview) return;
        const requestId = ++this._previewRequestId;
        const sessionSerial = this._sessionSerial;
        try {
            const value = this._resolvePreview(cloneDocument(documentValue), cloneValue(this._previewSettings), this._callbackContext({ phase: 'preview' }));
            Promise.resolve(value).then((result) => {
                if (!this.isOpen() || sessionSerial !== this._sessionSerial || requestId !== this._previewRequestId) return;
                if (result !== undefined) this._previewResult = cloneValue(result);
                this._renderPreviewControls();
                this._drawCanvas();
            }).catch((error) => {
                if (!this.isOpen() || sessionSerial !== this._sessionSerial || requestId !== this._previewRequestId) return;
                this.fitStatus.textContent = error instanceof Error ? error.message : String(error);
                this.fitStatus.classList.add('is-warning');
            });
        } catch (error) {
            this.fitStatus.textContent = error instanceof Error ? error.message : String(error);
            this.fitStatus.classList.add('is-warning');
        }
    }

    _emitPreview() {
        if (!this._onPreview || !this.isOpen()) return;
        try {
            this._onPreview(cloneDocument(this._resultDocument()), this._callbackContext({ phase: 'working-copy' }));
        } catch (error) {
            this.footerMessage.textContent = `Viewport preview failed: ${error instanceof Error ? error.message : String(error)}`;
            this.footerMessage.classList.add('is-error');
        }
    }

    _handlePanelClick(event) {
        const issueButton = event.target?.closest?.('[data-issue-id]');
        if (issueButton) {
            const target = issueButton.dataset.target;
            const documentValue = this._displayDocument();
            if (getRunById(documentValue, target)) this._selection = { type: 'run', id: target };
            else if (getCornerById(documentValue, target)) this._selection = { type: 'corner', id: target };
            this._renderSelection();
            this._renderToolbar();
            this._drawCanvas();
            this.canvas.focus({ preventScroll: true });
            return;
        }
        const button = event.target?.closest?.('[data-action]');
        const action = button?.dataset?.action;
        if (!action || button.disabled) return;
        if (action === 'silhouette:cancel') {
            this.cancel();
            return;
        }
        if (action === 'silhouette:apply') {
            this._apply();
            return;
        }
        if (action === 'silhouette:undo') {
            this._undo();
            return;
        }
        if (action === 'silhouette:redo') {
            this._redoOperation();
            return;
        }
        if (action === 'silhouette:detach') {
            this._detach();
            return;
        }
        if (action.startsWith('silhouette:tool:')) {
            this._tool = action.slice('silhouette:tool:'.length);
            this._renderToolbar();
            this._updateCanvasHint();
            this._drawCanvas();
            this.canvas.focus({ preventScroll: true });
            return;
        }
        if (action === 'silhouette:split') this._splitSelectedRun();
        else if (action === 'silhouette:merge') this._mergeSelection();
        else if (action === 'silhouette:delete') this._deleteSelection();
    }

    _handlePanelChange(event) {
        const input = event.target;
        const role = input?.dataset?.role;
        if (!role) return;
        if (role === 'silhouette:source') {
            this._setSourceMode(input.value);
            return;
        }
        if (role === 'silhouette:ghost-neighbors') {
            this._previewSettings.showNeighborGhosts = input.checked;
            this._renderPreviewControls();
            this._drawCanvas();
            return;
        }
        if (role === 'silhouette:lot-fit-enabled') {
            this._previewSettings.lotFitEnabled = input.checked;
            this._refreshPreviewResult();
            this._emitPreview();
            return;
        }
        if (role === 'silhouette:lot-width' || role === 'silhouette:lot-depth') {
            const key = role.endsWith('width') ? 'lotWidthMeters' : 'lotDepthMeters';
            this._previewSettings[key] = clamp(input.value, 1, 10000, this._previewSettings[key]);
            input.value = String(this._previewSettings[key]);
            this._refreshPreviewResult();
            this._emitPreview();
            return;
        }
        if (role === 'silhouette:remap-action' || role === 'silhouette:remap-run') {
            this._setRemapDecision(input);
            return;
        }
        this._handleInspectorChange(input, role);
    }

    _handleKeyDown(event) {
        if (!this.isOpen()) return;
        const modifier = event.ctrlKey || event.metaKey;
        const key = String(event.key ?? '').toLowerCase();
        if (isTextEntry(event.target) || isTextEntry(document.activeElement)) {
            if (key === 'escape') {
                event.preventDefault();
                this.cancel();
            }
            return;
        }
        if (modifier && key === 'z') {
            event.preventDefault();
            if (event.shiftKey) this._redoOperation();
            else this._undo();
            return;
        }
        if (modifier && key === 'y') {
            event.preventDefault();
            this._redoOperation();
            return;
        }
        if (key === 'escape') {
            event.preventDefault();
            this.cancel();
            return;
        }
        if (key === 'delete' || key === 'backspace') {
            event.preventDefault();
            this._deleteSelection();
            return;
        }
        if (key === 'v') this._tool = TOOL.SELECT;
        else if (key === 'm') this._tool = TOOL.TRANSLATE;
        else if (key === 'i') this._tool = TOOL.INSERT;
        else return;
        event.preventDefault();
        this._renderToolbar();
        this._updateCanvasHint();
        this._drawCanvas();
    }

    _setSourceMode(mode) {
        if (!Object.values(SOURCE_MODE).includes(mode) || mode === this._sourceMode || this._applying) return;
        if (mode === SOURCE_MODE.PREVIOUS && !this._previousSourceAvailable) {
            this.sourceSelect.value = this._sourceMode;
            this._showOperationError(new Error('The first floor layer has no previous layer to inherit.'));
            return;
        }
        const before = this._captureSnapshot('Change silhouette source');
        if (mode === SOURCE_MODE.DETACHED) {
            this._workingDocument = this._workingDocument ?? this._createDetachedDocument(this._resolvedInheritedDocument, this._inheritedDescriptor);
            if (!this._workingDocument) {
                this.sourceSelect.value = this._sourceMode;
                this._showOperationError(new Error('The selected inheritance source has no silhouette to detach.'));
                return;
            }
        } else {
            this._sourceMode = mode;
            this._inheritedDescriptor = normalizeLayerSilhouette({
                ...cloneDocument(this._inheritedDescriptor),
                version: 1,
                mode
            });
            this._resolvedInheritedDocument = this._resolveInheritedDocument(null);
        }
        this._sourceMode = mode;
        this._selection = null;
        this._updateRemapReport();
        this._recordSnapshot(before, 'Change silhouette source');
        this._refreshAll({ emitPreview: true });
    }

    _detach() {
        if (this._sourceMode === SOURCE_MODE.DETACHED || this._applying) return;
        const before = this._captureSnapshot('Detach inherited silhouette');
        const detached = this._createDetachedDocument(this._resolvedInheritedDocument, this._inheritedDescriptor);
        if (!detached) {
            this._showOperationError(new Error('The inherited silhouette could not be detached.'));
            return;
        }
        this._workingDocument = detached;
        this._rememberDocumentIdentities(detached);
        this._sourceMode = SOURCE_MODE.DETACHED;
        this._selection = null;
        this._updateRemapReport();
        this._recordSnapshot(before, 'Detach inherited silhouette');
        this._refreshAll({ emitPreview: true });
    }

    _performDocumentOperation(label, operation, { topology = false, selection = undefined } = {}) {
        if (this._sourceMode !== SOURCE_MODE.DETACHED || !this._workingDocument || this._applying) return false;
        const before = this._captureSnapshot(label);
        const previousDocument = cloneDocument(this._workingDocument);
        try {
            const next = safeNormalizeDocument(unwrapDocument(operation(cloneDocument(previousDocument)), label));
            if (!next?.loop?.length) throw new Error(`${label} produced an empty silhouette.`);
            this._workingDocument = next;
            if (selection !== undefined) this._selection = typeof selection === 'function' ? selection(next, previousDocument) : selection;
            if (topology) this._updateRemapReport();
            if (!this._recordSnapshot(before, label)) return false;
            this.footerMessage.textContent = '';
            this.footerMessage.classList.remove('is-error');
            this._refreshAll({ emitPreview: true });
            return true;
        } catch (error) {
            this._restoreSnapshot(before);
            this._showOperationError(error);
            this._refreshAll({ emitPreview: false });
            return false;
        }
    }

    _updateRemapReport() {
        const beforeLoop = this._baseDocument?.loop ?? [];
        const afterLoop = this._displayDocument()?.loop ?? [];
        try {
            const targets = cloneValue(this._constraints?.remapTargets ?? this._constraints?.targets
                ?? (this._remapReport?.targets ?? []).map((entry) => entry?.target).filter(Boolean));
            const availableRuns = new Set(afterLoop.map((point) => point?.runId));
            const stretchSource = this._sourceMode === SOURCE_MODE.DETACHED ? this._workingDocument : this._inheritedDescriptor;
            const localStretchTargets = (Array.isArray(stretchSource?.stretchBands) ? stretchSource.stretchBands : [])
                .filter((band) => band?.runId && !availableRuns.has(band.runId))
                .map((band) => ({
                    kind: 'stretch_band',
                    targetId: `silhouette_stretch:${band.id}`,
                    runId: band.runId,
                    localStretchBandId: band.id,
                    stretchBand: cloneValue(band)
                }));
            const targetIds = new Set(targets.map((target) => target?.targetId));
            for (const target of localStretchTargets) if (!targetIds.has(target.targetId)) targets.push(target);
            this._remapReport = createSilhouetteRemapReport({
                beforeLoop,
                afterLoop,
                targets
            });
            const previousDecisions = new Map(this._remapRows.map((row) => [row.id, cloneValue(row.decision)]));
            this._remapRows = remapEntriesFromReport(this._remapReport);
            for (const row of this._remapRows) if (previousDecisions.has(row.id)) row.decision = previousDecisions.get(row.id);
        } catch (error) {
            this._showOperationError(error);
        }
    }

    _materializeRemappedDocument(documentValue, resolution = this._resolveRemapDecisions()) {
        const next = cloneDocument(documentValue);
        if (!next || !Array.isArray(next.stretchBands)) return next;
        const availableLoop = next.loop ?? this._displayDocument()?.loop ?? [];
        const availableRuns = new Set(availableLoop.map((point) => point?.runId));
        const resolvedByTarget = new Map((resolution?.resolved ?? []).map((entry) => [entry.targetId, entry]));
        next.stretchBands = next.stretchBands.flatMap((band) => {
            if (!band?.runId || availableRuns.has(band.runId)) return [band];
            const resolved = resolvedByTarget.get(`silhouette_stretch:${band.id}`);
            const runId = resolved?.decision === SILHOUETTE_REMAP_DECISION.REMAP ? resolved?.resolvedRunIds?.[0] : null;
            return runId ? [{ ...band, runId }] : [];
        });
        return normalizeLayerSilhouette(next);
    }

    _splitSelectedRun() {
        if (this._selection?.type !== 'run') return;
        const runId = this._selection.id;
        this._performDocumentOperation('Split face',
            (documentValue) => splitSilhouetteRun(documentValue, { runId, fraction: 0.5 }),
            { topology: true, selection: { type: 'run', id: runId } });
    }

    _mergeSelection() {
        const documentValue = this._workingDocument;
        if (!documentValue || !this._selection) return;
        let cornerId = this._selection.type === 'corner' ? this._selection.id : null;
        let retainedRunId = null;
        if (this._selection.type === 'run') {
            const run = getRunById(documentValue, this._selection.id);
            cornerId = run?.end?.cornerId ?? null;
            retainedRunId = run?.start?.runId ?? null;
        } else {
            const corner = getCornerById(documentValue, cornerId);
            retainedRunId = corner ? documentValue.loop[(corner.index - 1 + documentValue.loop.length) % documentValue.loop.length]?.runId : null;
        }
        if (!cornerId) return;
        this._performDocumentOperation('Merge faces',
            (value) => mergeSilhouetteRuns(value, { cornerId }),
            { topology: true, selection: retainedRunId ? { type: 'run', id: retainedRunId } : null });
    }

    _deleteSelection() {
        const documentValue = this._workingDocument;
        if (!documentValue || !this._selection || documentValue.loop.length <= 3) return;
        let cornerId = this._selection.type === 'corner' ? this._selection.id : null;
        let retainedRunId = null;
        if (this._selection.type === 'run') {
            const run = getRunById(documentValue, this._selection.id);
            cornerId = run?.start?.cornerId ?? null;
            retainedRunId = run
                ? documentValue.loop[(run.index - 1 + documentValue.loop.length) % documentValue.loop.length]?.runId
                : null;
        } else {
            const corner = getCornerById(documentValue, cornerId);
            retainedRunId = corner ? documentValue.loop[(corner.index - 1 + documentValue.loop.length) % documentValue.loop.length]?.runId : null;
        }
        if (!cornerId) return;
        this._performDocumentOperation('Delete corner',
            (value) => deleteSilhouetteCorner(value, { cornerId }),
            { topology: true, selection: retainedRunId ? { type: 'run', id: retainedRunId } : null });
    }

    _handleInspectorChange(input, role) {
        if (this._sourceMode !== SOURCE_MODE.DETACHED || !this._workingDocument || this._applying) return;
        const selection = this._selection;
        if (role === 'silhouette:preferred-width' || role === 'silhouette:preferred-depth') {
            const key = role.endsWith('width') ? 'widthMeters' : 'depthMeters';
            const value = Number(input.value);
            this._performDocumentOperation('Change preferred design size', (documentValue) => {
                const next = cloneDocument(documentValue);
                const preferred = { ...(next.preferredSize ?? {}) };
                if (Number.isFinite(value) && value > 0) preferred[key] = value;
                else delete preferred[key];
                if (Object.keys(preferred).length) next.preferredSize = preferred;
                else delete next.preferredSize;
                return normalizeLayerSilhouette(next);
            });
            return;
        }
        if (!selection) return;
        if (selection.type === 'corner' && (role === 'silhouette:corner-x' || role === 'silhouette:corner-z')) {
            const corner = getCornerById(this._workingDocument, selection.id);
            if (String(input.value).trim() === '') return;
            const value = Number(input.value);
            if (!corner || !Number.isFinite(value)) return;
            const args = { cornerId: selection.id, x: corner.point.x, z: corner.point.z };
            if (role.endsWith('corner-x')) args.x = value;
            else args.z = value;
            this._performDocumentOperation('Move corner', (documentValue) => moveSilhouetteCorner(documentValue, args));
            return;
        }
        if (selection.type !== 'run') return;
        const run = getRunById(this._workingDocument, selection.id);
        if (!run) return;
        const metrics = getRunMetricsSafe(this._workingDocument, selection.id);
        const curve = resolveFootprintArcRun(run.start, run.end, run.start.arc);
        const midpoint = curve
            ? sampleResolvedFootprintArc(curve, curve.length * 0.5)
            : { x: (run.start.x + run.end.x) * 0.5, z: (run.start.z + run.end.z) * 0.5 };
        if (role === 'silhouette:run-center-x' || role === 'silhouette:run-center-z') {
            if (String(input.value).trim() === '') return;
            const value = Number(input.value);
            if (!Number.isFinite(value)) return;
            const dx = role.endsWith('center-x') ? value - midpoint.x : 0;
            const dz = role.endsWith('center-z') ? value - midpoint.z : 0;
            this._performDocumentOperation('Move face', (documentValue) => moveSilhouetteRun(documentValue, { runId: selection.id, dx, dz }));
            return;
        }
        if (role === 'silhouette:run-span') {
            if (String(input.value).trim() === '') return;
            const percent = clamp(input.value, 0.01, 49.5, 0);
            this._performDocumentOperation('Change face span',
                (documentValue) => this._solveRunSpanPercentage(documentValue, selection.id, percent));
            return;
        }
        if (role === 'silhouette:run-shape') {
            const outwardSign = signedArea(this._workingDocument.loop) >= 0 ? -1 : 1;
            const sweep = input.value === 'curved' ? outwardSign * ARC_SWEEP_DEFAULT_DEGREES * Math.PI / 180 : null;
            this._performDocumentOperation(input.value === 'curved' ? 'Curve face' : 'Straighten face',
                (documentValue) => setSilhouetteRunArc(documentValue, { runId: selection.id, sweepRadians: sweep }));
            return;
        }
        if (role === 'silhouette:arc-direction') {
            const magnitude = Math.abs(Number(metrics.sweepRadians ?? 0)) || ARC_SWEEP_DEFAULT_DEGREES * Math.PI / 180;
            const outwardSign = signedArea(this._workingDocument.loop) >= 0 ? -1 : 1;
            const sign = input.value === 'outward' ? outwardSign : -outwardSign;
            this._performDocumentOperation('Reverse curve direction',
                (documentValue) => setSilhouetteRunArc(documentValue, { runId: selection.id, sweepRadians: sign * magnitude }));
            return;
        }
        if (role === 'silhouette:arc-sweep') {
            if (String(input.value).trim() === '') return;
            const degrees = clamp(input.value, ARC_SWEEP_MIN_DEGREES, ARC_SWEEP_MAX_DEGREES, ARC_SWEEP_DEFAULT_DEGREES);
            const sign = Math.sign(Number(curve?.sweep ?? run.start?.arc?.bulge ?? 1)) || 1;
            this._performDocumentOperation('Change curve sweep',
                (documentValue) => setSilhouetteRunArc(documentValue, { runId: selection.id, sweepRadians: sign * degrees * Math.PI / 180 }));
            return;
        }
        if (role === 'silhouette:arc-radius') {
            if (String(input.value).trim() === '') return;
            const radius = Number(input.value);
            if (!Number.isFinite(radius)) return;
            const sign = Math.sign(Number(curve?.sweep ?? run.start?.arc?.bulge ?? 1)) || 1;
            this._performDocumentOperation('Change curve radius',
                (documentValue) => setSilhouetteRunArc(documentValue, { runId: selection.id, radius: sign * Math.abs(radius) }));
            return;
        }
        if (role === 'silhouette:band-mode') this._setRunBandMode(selection.id, input.value);
    }

    _solveRunSpanPercentage(documentValue, runId, percent) {
        const run = getRunById(documentValue, runId);
        if (!run) return documentValue;
        const dx = run.end.x - run.start.x;
        const dz = run.end.z - run.start.z;
        const initialChord = Math.hypot(dx, dz);
        if (!(initialChord > MIN_RUN_LENGTH_METERS)) return documentValue;
        const direction = { x: dx / initialChord, z: dz / initialChord };
        const target = clamp(percent, 0.01, 49.5, 0) / 100;
        const candidateAt = (chord) => moveSilhouetteCorner(documentValue, {
            cornerId: run.end.cornerId,
            x: run.start.x + direction.x * chord,
            z: run.start.z + direction.z * chord
        });
        const ratioAt = (candidate) => {
            const perimeter = candidate.loop.reduce((sum, point) => sum + Number(getRunMetricsSafe(candidate, point.runId)?.length ?? 0), 0);
            return perimeter > 1e-8 ? Number(getRunMetricsSafe(candidate, runId)?.length ?? 0) / perimeter : 0;
        };
        let low = MIN_RUN_LENGTH_METERS * 1.01;
        let high = Math.max(initialChord, 1);
        let highCandidate = candidateAt(high);
        for (let attempt = 0; attempt < 24 && ratioAt(highCandidate) < target; attempt++) {
            high *= 2;
            highCandidate = candidateAt(high);
        }
        let best = highCandidate;
        for (let iteration = 0; iteration < 42; iteration++) {
            const middle = (low + high) * 0.5;
            const candidate = candidateAt(middle);
            const ratio = ratioAt(candidate);
            best = candidate;
            if (Math.abs(ratio - target) < 1e-6) break;
            if (ratio < target) low = middle;
            else high = middle;
        }
        return best;
    }

    _setRunBandMode(runId, mode) {
        if (getRunById(this._workingDocument, runId)?.start?.arc !== undefined) return;
        this._performDocumentOperation('Change stretch band', (documentValue) => {
            const next = cloneDocument(documentValue);
            const retained = (Array.isArray(next.stretchBands) ? next.stretchBands : [])
                .filter((band) => band?.runId !== runId);
            if (mode !== 'pinned') {
                for (const end of ['start', 'end']) {
                    retained.push({
                        id: `${runId}:${end}`,
                        runId,
                        end,
                        preference: mode === 'prefer_expand' ? 'prefer_expand' : 'allow',
                        stretchable: true,
                        curveRule: 'pinned'
                    });
                }
            }
            next.stretchBands = retained;
            return normalizeLayerSilhouette(next);
        });
    }

    _setRemapDecision(input) {
        const id = input.dataset.remapId;
        const row = this._remapRows.find((entry) => entry.id === id);
        if (!row) return;
        const before = this._captureSnapshot('Review topology remap');
        if (input.dataset.role === 'silhouette:remap-action') {
            row.decision = input.value ? { action: input.value } : null;
        } else if (input.dataset.sourceRunId) {
            const sourceRunId = input.dataset.sourceRunId;
            const previous = row.decision?.runIdsBySource && typeof row.decision.runIdsBySource === 'object'
                ? row.decision.runIdsBySource
                : {};
            const runIdsBySource = { ...previous };
            if (input.value) runIdsBySource[sourceRunId] = input.value;
            else delete runIdsBySource[sourceRunId];
            row.decision = { action: SILHOUETTE_REMAP_DECISION.REMAP, runIdsBySource };
        } else {
            row.decision = { action: SILHOUETTE_REMAP_DECISION.REMAP, runId: input.value || null };
        }
        this._recordSnapshot(before, 'Review topology remap');
        this._refreshAll({ emitPreview: true, resolvePreview: false });
    }

    async _apply() {
        if (this._applying || this._settled || !this.isOpen()) return;
        this._callbackIssues = [];
        this._runValidationWithoutCallback();
        if (this._issues.some((issue) => issue.severity === 'error')) {
            this.footerMessage.textContent = 'Resolve the validation errors before applying.';
            this.footerMessage.classList.add('is-error');
            return;
        }
        this._applying = true;
        const sessionSerial = this._sessionSerial;
        this._renderSource();
        this._renderToolbar();
        this._renderHistory();
        this._renderValidation();
        const callback = this._onApply;
        try {
            if (this._validate) {
                const validationDocument = this._sourceMode === SOURCE_MODE.DETACHED
                    ? this._materializeRemappedDocument(this._resultDocument())
                    : cloneDocument(this._resultDocument());
                const result = await this._validate(validationDocument, this._callbackContext({ phase: 'validate-apply' }));
                if (sessionSerial !== this._sessionSerial || !this.isOpen() || this._settled) return;
                this._callbackIssues = validationEntries(result).map(normalizeIssue);
                this._runValidationWithoutCallback();
                if (this._issues.some((issue) => issue.severity === 'error')) {
                    this._applying = false;
                    this._renderSource();
                    this._renderToolbar();
                    this._renderHistory();
                    this._renderValidation();
                    this.footerMessage.textContent = 'Resolve the validation errors before applying.';
                    this.footerMessage.classList.add('is-error');
                    return;
                }
            }
            const remapResolution = this._resolveRemapDecisions();
            if (!remapResolution.valid) {
                this._applying = false;
                this._renderValidation();
                this.footerMessage.textContent = 'Complete every topology remap decision before applying.';
                this.footerMessage.classList.add('is-error');
                return;
            }
            let documentValue = cloneDocument(this._resultDocument());
            if (documentValue && this._remapReport) {
                documentValue = this._materializeRemappedDocument(documentValue, remapResolution);
                documentValue = normalizeLayerSilhouette({
                    ...documentValue,
                    targetRemap: cloneValue(remapResolution.targetRemap)
                });
            }
            const applied = await callback?.(documentValue, this._callbackContext({ phase: 'apply', remapResolution: cloneValue(remapResolution) }));
            if (applied === false) throw new Error('The silhouette change was rejected by the editor.');
            if (sessionSerial !== this._sessionSerial || !this.isOpen() || this._settled) return;
            this._settled = true;
            this.close({ notifyCancel: false });
        } catch (error) {
            if (sessionSerial !== this._sessionSerial || !this.isOpen()) return;
            this._applying = false;
            this.footerMessage.textContent = `Apply failed: ${error instanceof Error ? error.message : String(error)}`;
            this.footerMessage.classList.add('is-error');
            this._refreshAll({ emitPreview: false, resolvePreview: false });
        }
    }

    _showOperationError(error) {
        this.footerMessage.textContent = error instanceof Error ? error.message : String(error);
        this.footerMessage.classList.add('is-error');
    }

    _updateCanvasHint() {
        if (this._sourceMode !== SOURCE_MODE.DETACHED) {
            this.canvasHint.textContent = 'Read-only inherited silhouette · other floor outlines are dashed · detach to edit';
            return;
        }
        if (this._tool === TOOL.INSERT) this.canvasHint.textContent = 'Click a face to split it at that position · I';
        else if (this._tool === TOOL.TRANSLATE) this.canvasHint.textContent = 'Drag this floor outline against the other floors · M';
        else this.canvasHint.textContent = 'Other floor outlines are dashed · drag corners or faces · V';
    }

    _resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        const dpr = Math.max(1, Math.min(3, Number(window.devicePixelRatio) || 1));
        const pixelWidth = Math.max(1, Math.round(width * dpr));
        const pixelHeight = Math.max(1, Math.round(height * dpr));
        if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
            this.canvas.width = pixelWidth;
            this.canvas.height = pixelHeight;
        }
        return { width, height, dpr };
    }

    _visibleLoops() {
        const loops = [];
        const documentValue = this._displayDocument();
        if (documentValue?.loop?.length) loops.push(documentValue.loop);
        if (this._previewSettings?.showNeighborGhosts) {
            for (const ghost of this._ghosts) if (ghost.loop?.length) loops.push(ghost.loop);
        }
        const result = this._previewSettings?.lotFitEnabled ? this._previewResult : this._defaultPreviewResult;
        const previewLoop = result?.loop ?? result?.document?.loop ?? result?.silhouette?.loop;
        if (Array.isArray(previewLoop) && previewLoop.length >= 3) loops.push(previewLoop);
        return loops;
    }

    _buildViewTransform(width, height) {
        const loops = this._visibleLoops();
        const points = loops.flatMap((loop) => loop.flatMap((point, index) => sampleRun(loop, index, 18)));
        if (!points.length) {
            return {
                scale: 20,
                centerX: 0,
                centerZ: 0,
                screenCenterX: width * 0.5,
                screenCenterY: height * 0.5,
                width,
                height
            };
        }
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const point of points) {
            minX = Math.min(minX, Number(point.x));
            maxX = Math.max(maxX, Number(point.x));
            minZ = Math.min(minZ, Number(point.z));
            maxZ = Math.max(maxZ, Number(point.z));
        }
        if (this._previewSettings?.lotFitEnabled) {
            const centerX = (minX + maxX) * 0.5;
            const centerZ = (minZ + maxZ) * 0.5;
            const lotW = this._previewSettings.lotWidthMeters;
            const lotD = this._previewSettings.lotDepthMeters;
            minX = Math.min(minX, centerX - lotW * 0.5);
            maxX = Math.max(maxX, centerX + lotW * 0.5);
            minZ = Math.min(minZ, centerZ - lotD * 0.5);
            maxZ = Math.max(maxZ, centerZ + lotD * 0.5);
        }
        const spanX = Math.max(0.5, maxX - minX);
        const spanZ = Math.max(0.5, maxZ - minZ);
        const availableWidth = Math.max(1, width - CANVAS_PADDING_PX * 2);
        const availableHeight = Math.max(1, height - CANVAS_PADDING_PX * 2);
        return {
            scale: Math.max(0.01, Math.min(availableWidth / spanX, availableHeight / spanZ)),
            centerX: (minX + maxX) * 0.5,
            centerZ: (minZ + maxZ) * 0.5,
            screenCenterX: width * 0.5,
            screenCenterY: height * 0.5,
            width,
            height
        };
    }

    _worldToCanvas(point, transform = this._viewTransform) {
        return {
            x: transform.screenCenterX + (Number(point?.x) - transform.centerX) * transform.scale,
            y: transform.screenCenterY - (Number(point?.z) - transform.centerZ) * transform.scale
        };
    }

    _canvasToWorld(point, transform = this._viewTransform) {
        return {
            x: transform.centerX + (Number(point?.x) - transform.screenCenterX) / transform.scale,
            z: transform.centerZ - (Number(point?.y) - transform.screenCenterY) / transform.scale
        };
    }

    _drawCanvas() {
        if (!this.isOpen()) return;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        const { width, height, dpr } = this._resizeCanvas();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#121921';
        ctx.fillRect(0, 0, width, height);
        this._viewTransform = this._buildViewTransform(width, height);
        this._drawGrid(ctx);
        if (this._previewSettings?.lotFitEnabled) this._drawLotBounds(ctx);
        if (this._previewSettings?.showNeighborGhosts) {
            this._ghosts.forEach((ghost, index) => this._drawGhostLoop(ctx, ghost, index));
        }
        const documentValue = this._displayDocument();
        if (!documentValue?.loop?.length) {
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.font = '600 14px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No resolved silhouette', width * 0.5, height * 0.5);
            this._updateCanvasHint();
            return;
        }

        const designResult = this._previewSettings?.lotFitEnabled ? this._previewResult : this._defaultPreviewResult;
        const previewLoop = designResult?.loop ?? designResult?.document?.loop ?? designResult?.silhouette?.loop;
        if (Array.isArray(previewLoop) && previewLoop.length >= 3
            && stableSerialize(previewLoop.map(({ x, z }) => ({ x, z }))) !== stableSerialize(documentValue.loop.map(({ x, z }) => ({ x, z })))) {
            this._drawPreviewLoop(ctx, previewLoop);
        }
        this._drawAuthoredLoop(ctx, documentValue);
        this._updateCanvasHint();
    }

    _drawGrid(ctx) {
        const transform = this._viewTransform;
        const targetWorldStep = 48 / transform.scale;
        const powers = [1, 2, 5];
        const magnitude = 10 ** Math.floor(Math.log10(Math.max(0.001, targetWorldStep)));
        let step = powers.find((entry) => entry * magnitude >= targetWorldStep) * magnitude;
        if (!Number.isFinite(step)) step = magnitude * 10;
        const leftWorld = this._canvasToWorld({ x: 0, y: 0 }).x;
        const rightWorld = this._canvasToWorld({ x: transform.width, y: 0 }).x;
        const topWorld = this._canvasToWorld({ x: 0, y: 0 }).z;
        const bottomWorld = this._canvasToWorld({ x: 0, y: transform.height }).z;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.055)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = Math.floor(leftWorld / step) * step; x <= rightWorld; x += step) {
            const sx = this._worldToCanvas({ x, z: 0 }).x;
            ctx.moveTo(Math.round(sx) + 0.5, 0);
            ctx.lineTo(Math.round(sx) + 0.5, transform.height);
        }
        for (let z = Math.floor(bottomWorld / step) * step; z <= topWorld; z += step) {
            const sy = this._worldToCanvas({ x: 0, z }).y;
            ctx.moveTo(0, Math.round(sy) + 0.5);
            ctx.lineTo(transform.width, Math.round(sy) + 0.5);
        }
        ctx.stroke();
        ctx.restore();
    }

    _drawLotBounds(ctx) {
        const documentValue = this._displayDocument();
        const loop = documentValue?.loop ?? [];
        if (!loop.length) return;
        const xs = loop.map((point) => Number(point.x)).filter(Number.isFinite);
        const zs = loop.map((point) => Number(point.z)).filter(Number.isFinite);
        if (!xs.length || !zs.length) return;
        const centerX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
        const centerZ = (Math.min(...zs) + Math.max(...zs)) * 0.5;
        const halfW = this._previewSettings.lotWidthMeters * 0.5;
        const halfD = this._previewSettings.lotDepthMeters * 0.5;
        const a = this._worldToCanvas({ x: centerX - halfW, z: centerZ + halfD });
        const b = this._worldToCanvas({ x: centerX + halfW, z: centerZ - halfD });
        ctx.save();
        ctx.fillStyle = 'rgba(73, 157, 255, 0.035)';
        ctx.strokeStyle = 'rgba(92, 172, 255, 0.5)';
        ctx.setLineDash([7, 6]);
        ctx.lineWidth = 1.5;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(160, 208, 255, 0.9)';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${this._previewSettings.lotWidthMeters.toFixed(1)} × ${this._previewSettings.lotDepthMeters.toFixed(1)} m lot`, a.x + 7, a.y + 16);
        ctx.restore();
    }

    _traceLoop(ctx, loop) {
        ctx.beginPath();
        let started = false;
        for (let index = 0; index < loop.length; index++) {
            const samples = sampleRun(loop, index, 24);
            for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
                if (index > 0 && sampleIndex === 0) continue;
                const point = this._worldToCanvas(samples[sampleIndex]);
                if (!started) {
                    ctx.moveTo(point.x, point.y);
                    started = true;
                } else ctx.lineTo(point.x, point.y);
            }
        }
        ctx.closePath();
    }

    _drawGhostLoop(ctx, ghost, index) {
        ctx.save();
        this._traceLoop(ctx, ghost.loop);
        ctx.strokeStyle = ghost.color ?? `hsla(${190 + index * 32}, 72%, 72%, 0.32)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 5]);
        ctx.stroke();
        const anchorPoint = ghost.loop[index % ghost.loop.length] ?? ghost.loop[0];
        const anchor = this._worldToCanvas(anchorPoint);
        ctx.fillStyle = ghost.color ?? 'rgba(150,220,235,0.68)';
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillText(ghost.label, anchor.x + 7, anchor.y - 7 - index * 4);
        ctx.restore();
    }

    _drawPreviewLoop(ctx, loop) {
        ctx.save();
        this._traceLoop(ctx, loop);
        ctx.fillStyle = 'rgba(99, 226, 170, 0.055)';
        ctx.strokeStyle = 'rgba(99, 226, 170, 0.78)';
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 5]);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    _drawAuthoredLoop(ctx, documentValue) {
        const loop = documentValue.loop;
        ctx.save();
        this._traceLoop(ctx, loop);
        ctx.fillStyle = this._sourceMode === SOURCE_MODE.DETACHED ? 'rgba(62, 159, 208, 0.16)' : 'rgba(180, 192, 205, 0.10)';
        ctx.fill();
        ctx.restore();

        for (let index = 0; index < loop.length; index++) {
            const run = loop[index];
            const samples = sampleRun(loop, index, 28);
            const selected = this._selection?.type === 'run' && this._selection.id === run.runId;
            const hovered = this._hover?.type === 'run' && this._hover.id === run.runId;
            const bandState = this._runBandState(run.runId);
            ctx.save();
            ctx.beginPath();
            samples.forEach((sample, sampleIndex) => {
                const point = this._worldToCanvas(sample);
                if (sampleIndex === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.strokeStyle = selected
                ? '#72d9ff'
                : (hovered ? '#f0f8ff' : (bandState === 'pinned' ? 'rgba(222,231,239,0.78)' : 'rgba(84,226,172,0.9)'));
            ctx.lineWidth = selected ? 4 : (hovered ? 3 : 2.3);
            ctx.stroke();
            ctx.restore();
            this._drawBayRhythm(ctx, documentValue, run, index);
            this._drawFaceLabel(ctx, documentValue, run, index, samples, bandState, selected || hovered);
        }

        for (let index = 0; index < loop.length; index++) {
            const point = loop[index];
            const screen = this._worldToCanvas(point);
            const selected = this._selection?.type === 'corner' && this._selection.id === point.cornerId;
            const hovered = this._hover?.type === 'corner' && this._hover.id === point.cornerId;
            ctx.save();
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, selected ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = selected ? '#fff' : (hovered ? '#9fe8ff' : '#15232e');
            ctx.strokeStyle = selected ? '#55cffc' : 'rgba(210,238,249,0.95)';
            ctx.lineWidth = selected ? 3 : 2;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        this._drawSelectedCurveControl(ctx, documentValue);
    }

    _drawBayRhythm(ctx, documentValue, run, index) {
        const raw = this._constraints?.bayRhythmByRunId?.[run.runId]
            ?? this._constraints?.bayRhythm?.[run.runId]
            ?? this._constraints?.bayCountByRunId?.[run.runId];
        const widths = Array.isArray(raw) ? raw : (Array.isArray(raw?.widths) ? raw.widths : null);
        const fractions = [];
        if (widths?.length) {
            const positive = widths.map(Number).filter((value) => Number.isFinite(value) && value > 0);
            const total = positive.reduce((sum, value) => sum + value, 0);
            let consumed = 0;
            for (let widthIndex = 0; widthIndex < positive.length - 1; widthIndex++) {
                consumed += positive[widthIndex];
                fractions.push(consumed / total);
            }
        } else {
            const count = Math.round(Number(raw?.count ?? raw?.bayCount ?? raw));
            if (count > 1 && count <= 100) for (let bay = 1; bay < count; bay++) fractions.push(bay / count);
        }
        if (!fractions.length) return;
        const end = documentValue.loop[(index + 1) % documentValue.loop.length];
        const curve = resolveFootprintArcRun(run, end, run.arc);
        const chordLength = distance(run, end);
        ctx.save();
        ctx.strokeStyle = 'rgba(224,243,251,0.55)';
        ctx.lineWidth = 1;
        for (const fraction of fractions) {
            const sample = curve
                ? sampleResolvedFootprintArc(curve, curve.length * fraction)
                : {
                    x: run.x + (end.x - run.x) * fraction,
                    z: run.z + (end.z - run.z) * fraction,
                    tangent: chordLength > 1e-8
                        ? { x: (end.x - run.x) / chordLength, z: (end.z - run.z) / chordLength }
                        : null
                };
            if (!sample?.tangent) continue;
            const screen = this._worldToCanvas(sample);
            const normal = { x: sample.tangent.z, y: sample.tangent.x };
            ctx.beginPath();
            ctx.moveTo(screen.x - normal.x * 4, screen.y - normal.y * 4);
            ctx.lineTo(screen.x + normal.x * 4, screen.y + normal.y * 4);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawFaceLabel(ctx, documentValue, run, index, samples, bandState, emphasized) {
        if (!samples.length) return;
        const curve = resolveFootprintArcRun(run, documentValue.loop[(index + 1) % documentValue.loop.length], run.arc);
        const midpoint = curve
            ? sampleResolvedFootprintArc(curve, curve.length * 0.5)
            : {
                x: (Number(run.x) + Number(documentValue.loop[(index + 1) % documentValue.loop.length].x)) * 0.5,
                z: (Number(run.z) + Number(documentValue.loop[(index + 1) % documentValue.loop.length].z)) * 0.5
            };
        const screen = this._worldToCanvas(midpoint);
        const metrics = getRunMetricsSafe(documentValue, run.runId);
        const minimum = Number(this._constraints?.minRunLengths?.[run.runId]);
        const lineOne = `Face ${run.runId}  ${formatMeters(metrics.length)}`;
        const lineTwo = Number.isFinite(minimum)
            ? `min ${minimum.toFixed(2)} m · ${bandState === 'pinned' ? 'pinned' : 'stretch'}`
            : (bandState === 'pinned' ? 'pinned' : 'stretchable');
        ctx.save();
        ctx.font = '700 11px system-ui, sans-serif';
        const width = Math.max(ctx.measureText(lineOne).width, ctx.measureText(lineTwo).width) + 16;
        const x = screen.x - width * 0.5;
        const y = screen.y - 19;
        ctx.fillStyle = emphasized ? 'rgba(22, 54, 70, 0.96)' : 'rgba(10, 16, 22, 0.82)';
        ctx.strokeStyle = emphasized ? 'rgba(110, 217, 255, 0.95)' : 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, width, 38, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#eef8fc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lineOne, screen.x, y + 11);
        ctx.font = '600 9px system-ui, sans-serif';
        ctx.fillStyle = bandState === 'pinned' ? 'rgba(231,190,126,0.95)' : 'rgba(116,232,184,0.95)';
        ctx.fillText(lineTwo, screen.x, y + 27);
        ctx.restore();
    }

    _curveControlForRun(documentValue, runId) {
        const run = getRunById(documentValue, runId);
        if (!run) return null;
        const curve = resolveFootprintArcRun(run.start, run.end, run.start.arc);
        const chordMidpoint = {
            x: (Number(run.start.x) + Number(run.end.x)) * 0.5,
            z: (Number(run.start.z) + Number(run.end.z)) * 0.5
        };
        const curvePoint = curve
            ? sampleResolvedFootprintArc(curve, curve.length * 0.5)
            : chordMidpoint;
        return { run, curve, chordMidpoint, curvePoint };
    }

    _drawSelectedCurveControl(ctx, documentValue) {
        if (this._selection?.type !== 'run') return;
        const control = this._curveControlForRun(documentValue, this._selection.id);
        if (!control) return;
        const chordScreen = this._worldToCanvas(control.chordMidpoint);
        const curveScreen = this._worldToCanvas(control.curvePoint);
        ctx.save();
        ctx.strokeStyle = 'rgba(114,217,255,0.65)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(chordScreen.x, chordScreen.y);
        ctx.lineTo(curveScreen.x, curveScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.translate(curveScreen.x, curveScreen.y);
        ctx.rotate(Math.PI * 0.25);
        ctx.fillStyle = '#72d9ff';
        ctx.strokeStyle = '#10222d';
        ctx.lineWidth = 2;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
        if (control.curve) this._drawTangent(ctx, control);
    }

    _drawTangent(ctx, control) {
        const startSample = sampleResolvedFootprintArc(control.curve, 0);
        const endSample = sampleResolvedFootprintArc(control.curve, control.curve.length);
        ctx.save();
        ctx.strokeStyle = 'rgba(247,210,120,0.82)';
        ctx.lineWidth = 1.5;
        for (const [point, tangent] of [[control.run.start, startSample?.tangent], [control.run.end, endSample?.tangent]]) {
            if (!tangent) continue;
            const center = this._worldToCanvas(point);
            ctx.beginPath();
            ctx.moveTo(center.x - tangent.x * 19, center.y + tangent.z * 19);
            ctx.lineTo(center.x + tangent.x * 19, center.y - tangent.z * 19);
            ctx.stroke();
        }
        ctx.restore();
    }

    _eventCanvasPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    _pickCurveControl(canvasPoint) {
        if (this._selection?.type !== 'run') return null;
        const documentValue = this._displayDocument();
        const control = this._curveControlForRun(documentValue, this._selection.id);
        if (!control) return null;
        const screen = this._worldToCanvas(control.curvePoint);
        return Math.hypot(canvasPoint.x - screen.x, canvasPoint.y - screen.y) <= CANVAS_PICK_CORNER_PX
            ? { type: 'curve', id: this._selection.id }
            : null;
    }

    _pickAt(canvasPoint) {
        const documentValue = this._displayDocument();
        const loop = documentValue?.loop ?? [];
        let nearestCorner = null;
        for (const point of loop) {
            const screen = this._worldToCanvas(point);
            const distancePx = Math.hypot(canvasPoint.x - screen.x, canvasPoint.y - screen.y);
            if (distancePx <= CANVAS_PICK_CORNER_PX && (!nearestCorner || distancePx < nearestCorner.distancePx)) {
                nearestCorner = { type: 'corner', id: point.cornerId, distancePx };
            }
        }
        if (nearestCorner) return nearestCorner;
        let nearestRun = null;
        for (let index = 0; index < loop.length; index++) {
            const samples = sampleRun(loop, index, 36);
            for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex++) {
                const a = this._worldToCanvas(samples[sampleIndex]);
                const b = this._worldToCanvas(samples[sampleIndex + 1]);
                const hit = pointSegmentDistanceSq(canvasPoint, a, b);
                if (hit.distanceSq > CANVAS_PICK_FACE_PX * CANVAS_PICK_FACE_PX) continue;
                if (!nearestRun || hit.distanceSq < nearestRun.distanceSq) {
                    nearestRun = {
                        type: 'run',
                        id: loop[index].runId,
                        distanceSq: hit.distanceSq,
                        fraction: (sampleIndex + hit.t) / Math.max(1, samples.length - 1)
                    };
                }
            }
        }
        return nearestRun;
    }

    _handlePointerDown(event) {
        if (event.button !== 0 || !this._viewTransform) return;
        const canvasPoint = this._eventCanvasPoint(event);
        const editable = this._sourceMode === SOURCE_MODE.DETACHED && !!this._workingDocument && !this._applying;
        if (!editable) {
            const hit = this._pickAt(canvasPoint);
            this._selection = hit ? { type: hit.type, id: hit.id } : null;
            this._refreshAll({ emitPreview: false, resolvePreview: false });
            return;
        }
        if (this._tool === TOOL.INSERT) {
            const hit = this._pickAt(canvasPoint);
            if (hit?.type !== 'run') return;
            const oldCornerIds = new Set(this._workingDocument.loop.map((point) => point.cornerId));
            this._performDocumentOperation('Insert corner',
                (documentValue) => insertSilhouetteCorner(documentValue, { runId: hit.id, fraction: hit.fraction }),
                {
                    topology: true,
                    selection: (next) => {
                        const inserted = next.loop.find((point) => !oldCornerIds.has(point.cornerId));
                        return inserted ? { type: 'corner', id: inserted.cornerId } : { type: 'run', id: hit.id };
                    }
                });
            return;
        }

        const curveHit = this._pickCurveControl(canvasPoint);
        const hit = curveHit ?? this._pickAt(canvasPoint);
        if (this._tool === TOOL.SELECT && !hit) {
            this._selection = null;
            this._refreshAll({ emitPreview: false, resolvePreview: false });
            return;
        }
        if (hit && hit.type !== 'curve') this._selection = { type: hit.type, id: hit.id };
        const world = this._canvasToWorld(canvasPoint);
        this._drag = {
            pointerId: event.pointerId,
            kind: this._tool === TOOL.TRANSLATE ? 'translate' : hit?.type,
            id: hit?.id ?? null,
            startWorld: world,
            startDocument: cloneDocument(this._workingDocument),
            before: this._captureSnapshot(this._tool === TOOL.TRANSLATE ? 'Move silhouette' : (hit?.type === 'corner' ? 'Move corner' : (hit?.type === 'curve' ? 'Bend face' : 'Move face'))),
            label: this._tool === TOOL.TRANSLATE ? 'Move silhouette' : (hit?.type === 'corner' ? 'Move corner' : (hit?.type === 'curve' ? 'Bend face' : 'Move face'))
        };
        this.canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        this._renderSelection();
        this._renderToolbar();
        this._drawCanvas();
    }

    _handlePointerMove(event) {
        if (!this._viewTransform) return;
        const canvasPoint = this._eventCanvasPoint(event);
        if (!this._drag) {
            const hit = this._pickCurveControl(canvasPoint) ?? this._pickAt(canvasPoint);
            const hover = hit ? { type: hit.type, id: hit.id } : null;
            if (stableSerialize(hover) !== stableSerialize(this._hover)) {
                this._hover = hover;
                this._drawCanvas();
            }
            return;
        }
        if (event.pointerId !== this._drag.pointerId) return;
        const world = this._canvasToWorld(canvasPoint);
        const dx = world.x - this._drag.startWorld.x;
        const dz = world.z - this._drag.startWorld.z;
        try {
            let next = this._drag.startDocument;
            if (this._drag.kind === 'corner') {
                const corner = getCornerById(this._drag.startDocument, this._drag.id);
                next = moveSilhouetteCorner(this._drag.startDocument, {
                    cornerId: this._drag.id,
                    x: corner.point.x + dx,
                    z: corner.point.z + dz
                });
            } else if (this._drag.kind === 'run') {
                next = moveSilhouetteRun(this._drag.startDocument, { runId: this._drag.id, dx, dz });
            } else if (this._drag.kind === 'translate') {
                next = translateSilhouetteLoop(this._drag.startDocument, { dx, dz });
            } else if (this._drag.kind === 'curve') {
                next = this._documentWithCurveHandle(this._drag.startDocument, this._drag.id, world);
            }
            this._workingDocument = safeNormalizeDocument(next);
            this.footerMessage.textContent = '';
            this.footerMessage.classList.remove('is-error');
            this._renderSelection();
            this._runValidation();
            this._drawCanvas();
            this._emitPreview();
        } catch (error) {
            this._showOperationError(error);
        }
        event.preventDefault();
    }

    _documentWithCurveHandle(documentValue, runId, world) {
        const run = getRunById(documentValue, runId);
        if (!run) return documentValue;
        const dx = run.end.x - run.start.x;
        const dz = run.end.z - run.start.z;
        const chord = Math.hypot(dx, dz);
        if (!(chord > MIN_RUN_LENGTH_METERS)) return documentValue;
        const midpoint = { x: (run.start.x + run.end.x) * 0.5, z: (run.start.z + run.end.z) * 0.5 };
        const left = { x: -dz / chord, z: dx / chord };
        const sagitta = (world.x - midpoint.x) * left.x + (world.z - midpoint.z) * left.z;
        const rawBulge = -2 * sagitta / chord;
        const minBulge = Math.tan(ARC_SWEEP_MIN_DEGREES * Math.PI / 180 / 4);
        const maxBulge = Math.tan(ARC_SWEEP_MAX_DEGREES * Math.PI / 180 / 4);
        const bulge = Math.abs(rawBulge) < minBulge * 0.45
            ? null
            : Math.sign(rawBulge) * clamp(Math.abs(rawBulge), minBulge, maxBulge, minBulge);
        return setSilhouetteRunArc(documentValue, { runId, bulge });
    }

    _finishPointerDrag(event) {
        if (!this._drag || (event && event.pointerId !== this._drag.pointerId)) return;
        const drag = this._drag;
        this._drag = null;
        try {
            if (event) this.canvas.releasePointerCapture?.(event.pointerId);
        } catch {
            // Pointer capture may already have been released by the browser.
        }
        if (this._recordSnapshot(drag.before, drag.label)) {
            this._refreshAll({ emitPreview: true });
        } else {
            this._refreshAll({ emitPreview: false, resolvePreview: false });
        }
    }
}
