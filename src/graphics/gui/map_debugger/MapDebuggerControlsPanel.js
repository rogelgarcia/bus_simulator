// src/graphics/gui/map_debugger/MapDebuggerControlsPanel.js
// Controls map debugger toggles and render mode switches.
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

function clampNumber(value, lo, hi, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
}

function setNumberFieldValue(input, value) {
    if (!input) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    input.value = String(v);
}

function setRangeFieldValue(input, value) {
    if (!input) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    input.value = String(v);
}

function setRangeNumberPair({ range, number, value, lo, hi } = {}) {
    const v = clampNumber(value, lo, hi, lo);
    setRangeFieldValue(range, v);
    setNumberFieldValue(number, v);
    return v;
}

export class MapDebuggerControlsPanel {
    constructor({
        connectorDebugEnabled = true,
        hoverOutlineEnabled = true,
        collisionDebugEnabled = true,
        treesEnabled = true,
        roadEdgesEnabled = true,
        roadCrossingsEnabled = true,
        roadCenterlineEnabled = true,
        roadDirectionLinesEnabled = true,
        roadEndpointsEnabled = true,
        roadRenderMode = 'debug',
        trimThresholdFactor = 0.1,
        junctionThresholdFactor = 1.5,
        junctionFilletRadiusFactor = 1,
        junctionMinThreshold = 7.2,
        junctionMaxThreshold = null,
        onConnectorDebugToggle = null,
        onHoverOutlineToggle = null,
        onCollisionDebugToggle = null,
        onTreesToggle = null,
        onRoadEdgesToggle = null,
        onRoadCrossingsToggle = null,
        onRoadCenterlineToggle = null,
        onRoadDirectionLinesToggle = null,
        onRoadEndpointsToggle = null,
        onRoadRenderModeChange = null,
        onTrimThresholdFactorChange = null,
        onJunctionParamsChange = null
    } = {}) {
        this.root = document.createElement('div');
        this.root.className = 'map-debugger-controls-panel hidden';

        this.header = document.createElement('div');
        this.header.className = 'map-debugger-controls-header';

        this.title = document.createElement('div');
        this.title.className = 'map-debugger-controls-title';
        this.title.textContent = 'Map Debugger';

        this.minimizeBtn = document.createElement('button');
        this.minimizeBtn.type = 'button';
        this.minimizeBtn.className = 'map-debugger-controls-icon-btn';

        this.header.appendChild(this.title);
        this.header.appendChild(this.minimizeBtn);

        this.controls = document.createElement('div');
        this.controls.className = 'map-debugger-controls';
        this.connectorToggle = document.createElement('label');
        this.connectorToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.connectorToggleInput = document.createElement('input');
        this.connectorToggleInput.type = 'checkbox';
        this.connectorToggleInput.checked = !!connectorDebugEnabled;
        this.connectorToggleLabel = document.createElement('span');
        this.connectorToggleLabel.textContent = 'Curb debug';
        this.connectorToggle.appendChild(this.connectorToggleInput);
        this.connectorToggle.appendChild(this.connectorToggleLabel);
        this.controls.appendChild(this.connectorToggle);

        this.outlineToggle = document.createElement('label');
        this.outlineToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.outlineToggleInput = document.createElement('input');
        this.outlineToggleInput.type = 'checkbox';
        this.outlineToggleInput.checked = !!hoverOutlineEnabled;
        this.outlineToggleLabel = document.createElement('span');
        this.outlineToggleLabel.textContent = 'Hover outline';
        this.outlineToggle.appendChild(this.outlineToggleInput);
        this.outlineToggle.appendChild(this.outlineToggleLabel);
        this.controls.appendChild(this.outlineToggle);

        this.collisionToggle = document.createElement('label');
        this.collisionToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.collisionToggleInput = document.createElement('input');
        this.collisionToggleInput.type = 'checkbox';
        this.collisionToggleInput.checked = !!collisionDebugEnabled;
        this.collisionToggleLabel = document.createElement('span');
        this.collisionToggleLabel.textContent = 'Poles view';
        this.collisionToggle.appendChild(this.collisionToggleInput);
        this.collisionToggle.appendChild(this.collisionToggleLabel);
        this.controls.appendChild(this.collisionToggle);

        this.treesToggle = document.createElement('label');
        this.treesToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.treesToggleInput = document.createElement('input');
        this.treesToggleInput.type = 'checkbox';
        this.treesToggleInput.checked = !!treesEnabled;
        this.treesToggleLabel = document.createElement('span');
        this.treesToggleLabel.textContent = 'Trees';
        this.treesToggle.appendChild(this.treesToggleInput);
        this.treesToggle.appendChild(this.treesToggleLabel);
        this.controls.appendChild(this.treesToggle);

        this.roadEdgesToggle = document.createElement('label');
        this.roadEdgesToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.roadEdgesToggleInput = document.createElement('input');
        this.roadEdgesToggleInput.type = 'checkbox';
        this.roadEdgesToggleInput.checked = !!roadEdgesEnabled;
        this.roadEdgesToggleLabel = document.createElement('span');
        this.roadEdgesToggleLabel.textContent = 'Road edges';
        this.roadEdgesToggle.appendChild(this.roadEdgesToggleInput);
        this.roadEdgesToggle.appendChild(this.roadEdgesToggleLabel);
        this.controls.appendChild(this.roadEdgesToggle);

        this.roadCrossingsToggle = document.createElement('label');
        this.roadCrossingsToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.roadCrossingsToggleInput = document.createElement('input');
        this.roadCrossingsToggleInput.type = 'checkbox';
        this.roadCrossingsToggleInput.checked = !!roadCrossingsEnabled;
        this.roadCrossingsToggleLabel = document.createElement('span');
        this.roadCrossingsToggleLabel.textContent = 'Road crossings';
        this.roadCrossingsToggle.appendChild(this.roadCrossingsToggleInput);
        this.roadCrossingsToggle.appendChild(this.roadCrossingsToggleLabel);
        this.controls.appendChild(this.roadCrossingsToggle);

        this.roadCenterlineToggle = document.createElement('label');
        this.roadCenterlineToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.roadCenterlineToggleInput = document.createElement('input');
        this.roadCenterlineToggleInput.type = 'checkbox';
        this.roadCenterlineToggleInput.checked = !!roadCenterlineEnabled;
        this.roadCenterlineToggleLabel = document.createElement('span');
        this.roadCenterlineToggleLabel.textContent = 'Road centerline';
        this.roadCenterlineToggle.appendChild(this.roadCenterlineToggleInput);
        this.roadCenterlineToggle.appendChild(this.roadCenterlineToggleLabel);
        this.controls.appendChild(this.roadCenterlineToggle);

        this.roadDirectionLinesToggle = document.createElement('label');
        this.roadDirectionLinesToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.roadDirectionLinesToggleInput = document.createElement('input');
        this.roadDirectionLinesToggleInput.type = 'checkbox';
        this.roadDirectionLinesToggleInput.checked = !!roadDirectionLinesEnabled;
        this.roadDirectionLinesToggleLabel = document.createElement('span');
        this.roadDirectionLinesToggleLabel.textContent = 'Road directions';
        this.roadDirectionLinesToggle.appendChild(this.roadDirectionLinesToggleInput);
        this.roadDirectionLinesToggle.appendChild(this.roadDirectionLinesToggleLabel);
        this.controls.appendChild(this.roadDirectionLinesToggle);

        this.roadEndpointsToggle = document.createElement('label');
        this.roadEndpointsToggle.className = 'connector-debug-toggle-switch map-debugger-toggle-switch';
        this.roadEndpointsToggleInput = document.createElement('input');
        this.roadEndpointsToggleInput.type = 'checkbox';
        this.roadEndpointsToggleInput.checked = !!roadEndpointsEnabled;
        this.roadEndpointsToggleLabel = document.createElement('span');
        this.roadEndpointsToggleLabel.textContent = 'Road endpoints';
        this.roadEndpointsToggle.appendChild(this.roadEndpointsToggleInput);
        this.roadEndpointsToggle.appendChild(this.roadEndpointsToggleLabel);
        this.controls.appendChild(this.roadEndpointsToggle);

        this.displaySection = document.createElement('div');
        this.displaySection.className = 'map-debugger-section';
        this.displayTitle = document.createElement('div');
        this.displayTitle.className = 'map-debugger-section-title';
        this.displayTitle.textContent = 'Display';
        this.displayRow = document.createElement('div');
        this.displayRow.className = 'map-debugger-mode-row';
        this.displayLabel = document.createElement('span');
        this.displayLabel.className = 'map-debugger-mode-label';
        this.displayLabel.textContent = 'Road rendering mode:';
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'map-debugger-mode-selector';
        this.modeNormal = document.createElement('button');
        this.modeNormal.type = 'button';
        this.modeNormal.className = 'map-debugger-mode-text';
        this.modeNormal.textContent = 'Normal';
        this.modeToggle = document.createElement('button');
        this.modeToggle.type = 'button';
        this.modeToggle.className = 'map-debugger-mode-toggle';
        this.modeToggleThumb = document.createElement('span');
        this.modeToggleThumb.className = 'map-debugger-mode-thumb';
        this.modeToggle.appendChild(this.modeToggleThumb);
        this.modeDebug = document.createElement('button');
        this.modeDebug.type = 'button';
        this.modeDebug.className = 'map-debugger-mode-text';
        this.modeDebug.textContent = 'Debug';
        this.modeSelector.appendChild(this.modeNormal);
        this.modeSelector.appendChild(this.modeToggle);
        this.modeSelector.appendChild(this.modeDebug);
        this.displayRow.appendChild(this.displayLabel);
        this.displayRow.appendChild(this.modeSelector);
        this.displaySection.appendChild(this.displayTitle);
        this.displaySection.appendChild(this.displayRow);

        this.crossingsSection = document.createElement('div');
        this.crossingsSection.className = 'map-debugger-section';
        this.crossingsTitle = document.createElement('div');
        this.crossingsTitle.className = 'map-debugger-section-title';
        this.crossingsTitle.textContent = 'Crossings';
        this.crossingsSection.appendChild(this.crossingsTitle);

        this.trimThresholdRow = document.createElement('div');
        this.trimThresholdRow.className = 'map-debugger-mode-row';
        this.trimThresholdRow.title = 'Crossing trim threshold for near-overlaps (as a fraction of laneWidth). Higher values treat close strips as overlapping.';
        this.trimThresholdLabel = document.createElement('span');
        this.trimThresholdLabel.className = 'map-debugger-mode-label';
        this.trimThresholdLabel.textContent = 'threshold × laneWidth:';
        this.trimThresholdInputs = document.createElement('div');
        this.trimThresholdInputs.className = 'map-debugger-mode-inputs';
        this.trimThresholdRange = document.createElement('input');
        this.trimThresholdRange.type = 'range';
        this.trimThresholdRange.min = '0';
        this.trimThresholdRange.max = '5';
        this.trimThresholdRange.step = '0.01';
        this.trimThresholdRange.className = 'map-debugger-controls-range';
        this.trimThresholdInput = document.createElement('input');
        this.trimThresholdInput.type = 'number';
        this.trimThresholdInput.min = '0';
        this.trimThresholdInput.max = '5';
        this.trimThresholdInput.step = '0.01';
        this.trimThresholdInput.className = 'map-debugger-controls-input';
        const initialTrimFactor = clampNumber(trimThresholdFactor, 0, 5, 0.1);
        this.trimThresholdRange.value = String(initialTrimFactor);
        this.trimThresholdInput.value = String(initialTrimFactor);
        this.trimThresholdInputs.appendChild(this.trimThresholdRange);
        this.trimThresholdInputs.appendChild(this.trimThresholdInput);
        this.trimThresholdRow.appendChild(this.trimThresholdLabel);
        this.trimThresholdRow.appendChild(this.trimThresholdInputs);
        this.crossingsSection.appendChild(this.trimThresholdRow);

        this.junctionSection = document.createElement('div');
        this.junctionSection.className = 'map-debugger-section';
        this.junctionTitle = document.createElement('div');
        this.junctionTitle.className = 'map-debugger-section-title';
        this.junctionTitle.textContent = 'Junctions';
        this.junctionSection.appendChild(this.junctionTitle);

        this.junctionMinThresholdRow = document.createElement('div');
        this.junctionMinThresholdRow.className = 'map-debugger-mode-row';
        this.junctionMinThresholdLabel = document.createElement('span');
        this.junctionMinThresholdLabel.className = 'map-debugger-mode-label';
        this.junctionMinThresholdLabel.textContent = 'Min threshold (m):';
        this.junctionMinThresholdInputs = document.createElement('div');
        this.junctionMinThresholdInputs.className = 'map-debugger-mode-inputs';
        this.junctionMinThresholdRange = document.createElement('input');
        this.junctionMinThresholdRange.type = 'range';
        this.junctionMinThresholdRange.min = '0';
        this.junctionMinThresholdRange.max = '40';
        this.junctionMinThresholdRange.step = '0.1';
        this.junctionMinThresholdRange.className = 'map-debugger-controls-range';
        this.junctionMinThresholdInput = document.createElement('input');
        this.junctionMinThresholdInput.type = 'number';
        this.junctionMinThresholdInput.min = '0';
        this.junctionMinThresholdInput.step = '0.1';
        this.junctionMinThresholdInput.className = 'map-debugger-controls-input';
        const minThresholdValue = clampNumber(junctionMinThreshold, 0, 40, 7.2);
        this.junctionMinThresholdRange.value = String(minThresholdValue);
        this.junctionMinThresholdInput.value = String(minThresholdValue);
        this.junctionMinThresholdInputs.appendChild(this.junctionMinThresholdRange);
        this.junctionMinThresholdInputs.appendChild(this.junctionMinThresholdInput);
        this.junctionMinThresholdRow.appendChild(this.junctionMinThresholdLabel);
        this.junctionMinThresholdRow.appendChild(this.junctionMinThresholdInputs);
        this.junctionSection.appendChild(this.junctionMinThresholdRow);

        this.junctionMaxThresholdRow = document.createElement('div');
        this.junctionMaxThresholdRow.className = 'map-debugger-mode-row';
        this.junctionMaxThresholdLabel = document.createElement('span');
        this.junctionMaxThresholdLabel.className = 'map-debugger-mode-label';
        this.junctionMaxThresholdLabel.textContent = 'Max threshold (m):';
        this.junctionMaxThresholdInputs = document.createElement('div');
        this.junctionMaxThresholdInputs.className = 'map-debugger-mode-inputs';
        this.junctionMaxThresholdRange = document.createElement('input');
        this.junctionMaxThresholdRange.type = 'range';
        this.junctionMaxThresholdRange.min = '0';
        this.junctionMaxThresholdRange.max = '200';
        this.junctionMaxThresholdRange.step = '0.1';
        this.junctionMaxThresholdRange.className = 'map-debugger-controls-range';
        this.junctionMaxThresholdInput = document.createElement('input');
        this.junctionMaxThresholdInput.type = 'number';
        this.junctionMaxThresholdInput.min = '0';
        this.junctionMaxThresholdInput.step = '0.1';
        this.junctionMaxThresholdInput.placeholder = '∞';
        this.junctionMaxThresholdInput.className = 'map-debugger-controls-input';
        this.junctionMaxInfinityLabel = document.createElement('label');
        this.junctionMaxInfinityLabel.className = 'map-debugger-controls-infinity';
        this.junctionMaxInfinityInput = document.createElement('input');
        this.junctionMaxInfinityInput.type = 'checkbox';
        this.junctionMaxInfinityText = document.createElement('span');
        this.junctionMaxInfinityText.textContent = '∞';
        this.junctionMaxInfinityLabel.appendChild(this.junctionMaxInfinityInput);
        this.junctionMaxInfinityLabel.appendChild(this.junctionMaxInfinityText);
        const maxThresholdValue = junctionMaxThreshold === null || junctionMaxThreshold === undefined
            ? Number.NaN
            : Number(junctionMaxThreshold);
        this._junctionMaxLastFinite = Number.isFinite(maxThresholdValue) ? maxThresholdValue : 200;
        if (Number.isFinite(maxThresholdValue)) {
            this.junctionMaxThresholdRange.value = String(clampNumber(maxThresholdValue, 0, 200, 0));
            this.junctionMaxThresholdInput.value = String(maxThresholdValue);
            this.junctionMaxInfinityInput.checked = false;
        } else {
            this.junctionMaxThresholdRange.value = String(clampNumber(this._junctionMaxLastFinite, 0, 200, 200));
            this.junctionMaxThresholdInput.value = '';
            this.junctionMaxInfinityInput.checked = true;
        }
        this.junctionMaxThresholdInputs.appendChild(this.junctionMaxThresholdRange);
        this.junctionMaxThresholdInputs.appendChild(this.junctionMaxThresholdInput);
        this.junctionMaxThresholdInputs.appendChild(this.junctionMaxInfinityLabel);
        this.junctionMaxThresholdRow.appendChild(this.junctionMaxThresholdLabel);
        this.junctionMaxThresholdRow.appendChild(this.junctionMaxThresholdInputs);
        this.junctionSection.appendChild(this.junctionMaxThresholdRow);

        this.junctionThresholdRow = document.createElement('div');
        this.junctionThresholdRow.className = 'map-debugger-mode-row';
        this.junctionThresholdLabel = document.createElement('span');
        this.junctionThresholdLabel.className = 'map-debugger-mode-label';
        this.junctionThresholdLabel.textContent = 'Threshold factor:';
        this.junctionThresholdInputs = document.createElement('div');
        this.junctionThresholdInputs.className = 'map-debugger-mode-inputs';
        this.junctionThresholdRange = document.createElement('input');
        this.junctionThresholdRange.type = 'range';
        this.junctionThresholdRange.min = '0';
        this.junctionThresholdRange.max = '5';
        this.junctionThresholdRange.step = '0.05';
        this.junctionThresholdRange.className = 'map-debugger-controls-range';
        this.junctionThresholdInput = document.createElement('input');
        this.junctionThresholdInput.type = 'number';
        this.junctionThresholdInput.min = '0';
        this.junctionThresholdInput.step = '0.05';
        this.junctionThresholdInput.className = 'map-debugger-controls-input';
        const thresholdValue = clampNumber(junctionThresholdFactor, 0, 5, 1.5);
        this.junctionThresholdRange.value = String(thresholdValue);
        this.junctionThresholdInput.value = String(thresholdValue);
        this.junctionThresholdInputs.appendChild(this.junctionThresholdRange);
        this.junctionThresholdInputs.appendChild(this.junctionThresholdInput);
        this.junctionThresholdRow.appendChild(this.junctionThresholdLabel);
        this.junctionThresholdRow.appendChild(this.junctionThresholdInputs);
        this.junctionSection.appendChild(this.junctionThresholdRow);

        this.junctionFilletRow = document.createElement('div');
        this.junctionFilletRow.className = 'map-debugger-mode-row';
        this.junctionFilletLabel = document.createElement('span');
        this.junctionFilletLabel.className = 'map-debugger-mode-label';
        this.junctionFilletLabel.textContent = 'Fillet factor:';
        this.junctionFilletInputs = document.createElement('div');
        this.junctionFilletInputs.className = 'map-debugger-mode-inputs';
        this.junctionFilletRange = document.createElement('input');
        this.junctionFilletRange.type = 'range';
        this.junctionFilletRange.min = '0';
        this.junctionFilletRange.max = '1';
        this.junctionFilletRange.step = '0.01';
        this.junctionFilletRange.className = 'map-debugger-controls-range';
        this.junctionFilletInput = document.createElement('input');
        this.junctionFilletInput.type = 'number';
        this.junctionFilletInput.min = '0';
        this.junctionFilletInput.max = '1';
        this.junctionFilletInput.step = '0.01';
        this.junctionFilletInput.className = 'map-debugger-controls-input';
        const filletValue = clampNumber(junctionFilletRadiusFactor, 0, 1, 1);
        this.junctionFilletRange.value = String(filletValue);
        this.junctionFilletInput.value = String(filletValue);
        this.junctionFilletInputs.appendChild(this.junctionFilletRange);
        this.junctionFilletInputs.appendChild(this.junctionFilletInput);
        this.junctionFilletRow.appendChild(this.junctionFilletLabel);
        this.junctionFilletRow.appendChild(this.junctionFilletInputs);
        this.junctionSection.appendChild(this.junctionFilletRow);

        this.columns = document.createElement('div');
        this.columns.className = 'map-debugger-controls-columns';
        this.leftColumn = document.createElement('div');
        this.leftColumn.className = 'map-debugger-controls-column';
        this.rightColumn = document.createElement('div');
        this.rightColumn.className = 'map-debugger-controls-column';

        this.leftColumn.appendChild(this.controls);
        this.leftColumn.appendChild(this.displaySection);
        this.rightColumn.appendChild(this.crossingsSection);
        this.rightColumn.appendChild(this.junctionSection);
        this.columns.appendChild(this.leftColumn);
        this.columns.appendChild(this.rightColumn);

        this.root.appendChild(this.header);
        this.root.appendChild(this.columns);

        this._onConnectorDebugToggle = onConnectorDebugToggle;
        this._onHoverOutlineToggle = onHoverOutlineToggle;
        this._onCollisionDebugToggle = onCollisionDebugToggle;
        this._onTreesToggle = onTreesToggle;
        this._onRoadEdgesToggle = onRoadEdgesToggle;
        this._onRoadCrossingsToggle = onRoadCrossingsToggle;
        this._onRoadCenterlineToggle = onRoadCenterlineToggle;
        this._onRoadDirectionLinesToggle = onRoadDirectionLinesToggle;
        this._onRoadEndpointsToggle = onRoadEndpointsToggle;
        this._onRoadRenderModeChange = onRoadRenderModeChange;
        this._onTrimThresholdFactorChange = onTrimThresholdFactorChange;
        this._onJunctionParamsChange = onJunctionParamsChange;
        this._junctionEmitTimer = 0;
        this._trimEmitTimer = 0;
        this._minimized = false;

        this._syncMinimizeUi();

        this._setRoadRenderMode(roadRenderMode);

        this.minimizeBtn.addEventListener('click', () => {
            this._minimized = !this._minimized;
            this._syncMinimizeUi();
        });

        this.connectorToggleInput.addEventListener('change', () => {
            if (this._onConnectorDebugToggle) this._onConnectorDebugToggle(this.connectorToggleInput.checked);
        });

        this.outlineToggleInput.addEventListener('change', () => {
            if (this._onHoverOutlineToggle) this._onHoverOutlineToggle(this.outlineToggleInput.checked);
        });

        this.collisionToggleInput.addEventListener('change', () => {
            if (this._onCollisionDebugToggle) this._onCollisionDebugToggle(this.collisionToggleInput.checked);
        });

        this.treesToggleInput.addEventListener('change', () => {
            if (this._onTreesToggle) this._onTreesToggle(this.treesToggleInput.checked);
        });

        this.roadEdgesToggleInput.addEventListener('change', () => {
            if (this._onRoadEdgesToggle) this._onRoadEdgesToggle(this.roadEdgesToggleInput.checked);
        });

        this.roadCrossingsToggleInput.addEventListener('change', () => {
            if (this._onRoadCrossingsToggle) this._onRoadCrossingsToggle(this.roadCrossingsToggleInput.checked);
        });

        this.roadCenterlineToggleInput.addEventListener('change', () => {
            if (this._onRoadCenterlineToggle) this._onRoadCenterlineToggle(this.roadCenterlineToggleInput.checked);
        });

        this.roadDirectionLinesToggleInput.addEventListener('change', () => {
            if (this._onRoadDirectionLinesToggle) this._onRoadDirectionLinesToggle(this.roadDirectionLinesToggleInput.checked);
        });

        this.roadEndpointsToggleInput.addEventListener('change', () => {
            if (this._onRoadEndpointsToggle) this._onRoadEndpointsToggle(this.roadEndpointsToggleInput.checked);
        });

        this.trimThresholdRange.addEventListener('input', () => {
            const next = setRangeNumberPair({ range: this.trimThresholdRange, number: this.trimThresholdInput, value: this.trimThresholdRange.value, lo: 0, hi: 5 });
            this._queueTrimThresholdFactorChange(next);
        });
        this.trimThresholdInput.addEventListener('change', () => {
            const next = setRangeNumberPair({ range: this.trimThresholdRange, number: this.trimThresholdInput, value: this.trimThresholdInput.value, lo: 0, hi: 5 });
            this._emitTrimThresholdFactorChange(next);
        });

        this.junctionMinThresholdRange.addEventListener('input', () => {
            setRangeNumberPair({ range: this.junctionMinThresholdRange, number: this.junctionMinThresholdInput, value: this.junctionMinThresholdRange.value, lo: 0, hi: 40 });
            this._queueJunctionParamsChange();
        });
        this.junctionMinThresholdInput.addEventListener('change', () => {
            setRangeNumberPair({ range: this.junctionMinThresholdRange, number: this.junctionMinThresholdInput, value: this.junctionMinThresholdInput.value, lo: 0, hi: 40 });
            this._emitJunctionParamsChange();
        });

        this.junctionMaxThresholdRange.addEventListener('input', () => {
            this.junctionMaxInfinityInput.checked = false;
            const next = setRangeNumberPair({ range: this.junctionMaxThresholdRange, number: this.junctionMaxThresholdInput, value: this.junctionMaxThresholdRange.value, lo: 0, hi: 200 });
            this._junctionMaxLastFinite = next;
            this._queueJunctionParamsChange();
        });
        this.junctionMaxThresholdInput.addEventListener('change', () => {
            const raw = typeof this.junctionMaxThresholdInput.value === 'string' ? this.junctionMaxThresholdInput.value.trim() : '';
            if (!raw) {
                this.junctionMaxInfinityInput.checked = true;
                this._emitJunctionParamsChange();
                return;
            }
            this.junctionMaxInfinityInput.checked = false;
            const next = setRangeNumberPair({ range: this.junctionMaxThresholdRange, number: this.junctionMaxThresholdInput, value: raw, lo: 0, hi: 200 });
            this._junctionMaxLastFinite = next;
            this._emitJunctionParamsChange();
        });
        this.junctionMaxInfinityInput.addEventListener('change', () => {
            const enabled = this.junctionMaxInfinityInput.checked;
            if (enabled) {
                this.junctionMaxThresholdInput.value = '';
                this._emitJunctionParamsChange();
                return;
            }
            const minValue = Number(this.junctionMinThresholdInput?.value);
            const fallback = Number.isFinite(minValue) ? minValue : 0;
            const next = setRangeNumberPair({ range: this.junctionMaxThresholdRange, number: this.junctionMaxThresholdInput, value: this._junctionMaxLastFinite || fallback, lo: 0, hi: 200 });
            this._junctionMaxLastFinite = next;
            this._emitJunctionParamsChange();
        });

        this.junctionThresholdRange.addEventListener('input', () => {
            setRangeNumberPair({ range: this.junctionThresholdRange, number: this.junctionThresholdInput, value: this.junctionThresholdRange.value, lo: 0, hi: 5 });
            this._queueJunctionParamsChange();
        });
        this.junctionThresholdInput.addEventListener('change', () => {
            setRangeNumberPair({ range: this.junctionThresholdRange, number: this.junctionThresholdInput, value: this.junctionThresholdInput.value, lo: 0, hi: 5 });
            this._emitJunctionParamsChange();
        });

        this.junctionFilletRange.addEventListener('input', () => {
            setRangeNumberPair({ range: this.junctionFilletRange, number: this.junctionFilletInput, value: this.junctionFilletRange.value, lo: 0, hi: 1 });
            this._queueJunctionParamsChange();
        });
        this.junctionFilletInput.addEventListener('change', () => {
            setRangeNumberPair({ range: this.junctionFilletRange, number: this.junctionFilletInput, value: this.junctionFilletInput.value, lo: 0, hi: 1 });
            this._emitJunctionParamsChange();
        });

        this.modeToggle.addEventListener('click', () => {
            const next = this._roadRenderMode === 'debug' ? 'normal' : 'debug';
            this._setRoadRenderMode(next);
            if (this._onRoadRenderModeChange) this._onRoadRenderModeChange(this._roadRenderMode);
        });

        this.modeNormal.addEventListener('click', () => {
            if (this._roadRenderMode === 'normal') return;
            this._setRoadRenderMode('normal');
            if (this._onRoadRenderModeChange) this._onRoadRenderModeChange(this._roadRenderMode);
        });

        this.modeDebug.addEventListener('click', () => {
            if (this._roadRenderMode === 'debug') return;
            this._setRoadRenderMode('debug');
            if (this._onRoadRenderModeChange) this._onRoadRenderModeChange(this._roadRenderMode);
        });
    }

    setConnectorDebugEnabled(enabled) {
        if (this.connectorToggleInput) this.connectorToggleInput.checked = !!enabled;
    }

    setHoverOutlineEnabled(enabled) {
        if (this.outlineToggleInput) this.outlineToggleInput.checked = !!enabled;
    }

    setCollisionDebugEnabled(enabled) {
        if (this.collisionToggleInput) this.collisionToggleInput.checked = !!enabled;
    }

    setTreesEnabled(enabled) {
        if (this.treesToggleInput) this.treesToggleInput.checked = !!enabled;
    }

    setRoadEdgesEnabled(enabled) {
        if (this.roadEdgesToggleInput) this.roadEdgesToggleInput.checked = !!enabled;
    }

    setRoadCrossingsEnabled(enabled) {
        if (this.roadCrossingsToggleInput) this.roadCrossingsToggleInput.checked = !!enabled;
    }

    setRoadCenterlineEnabled(enabled) {
        if (this.roadCenterlineToggleInput) this.roadCenterlineToggleInput.checked = !!enabled;
    }

    setRoadDirectionLinesEnabled(enabled) {
        if (this.roadDirectionLinesToggleInput) this.roadDirectionLinesToggleInput.checked = !!enabled;
    }

    setRoadEndpointsEnabled(enabled) {
        if (this.roadEndpointsToggleInput) this.roadEndpointsToggleInput.checked = !!enabled;
    }

    setRoadRenderMode(mode) {
        this._setRoadRenderMode(mode);
    }

    setTrimThresholdFactor(value) {
        if (!this.trimThresholdRange || !this.trimThresholdInput) return;
        const v = clampNumber(value, 0, 5, 0.1);
        this.trimThresholdRange.value = String(v);
        this.trimThresholdInput.value = String(v);
    }

    setJunctionThresholdFactor(value) {
        if (!this.junctionThresholdRange || !this.junctionThresholdInput) return;
        const v = clampNumber(value, 0, 5, 1.5);
        this.junctionThresholdRange.value = String(v);
        this.junctionThresholdInput.value = String(v);
    }

    setJunctionFilletRadiusFactor(value) {
        if (!this.junctionFilletRange || !this.junctionFilletInput) return;
        const v = clampNumber(value, 0, 1, 1);
        this.junctionFilletRange.value = String(v);
        this.junctionFilletInput.value = String(v);
    }

    setJunctionMinThreshold(value) {
        if (!this.junctionMinThresholdRange || !this.junctionMinThresholdInput) return;
        const v = clampNumber(value, 0, 40, 7.2);
        this.junctionMinThresholdRange.value = String(v);
        this.junctionMinThresholdInput.value = String(v);
    }

    setJunctionMaxThreshold(value) {
        const v = Number(value);
        if (!this.junctionMaxThresholdRange || !this.junctionMaxThresholdInput || !this.junctionMaxInfinityInput) return;
        if (!Number.isFinite(v)) {
            this.junctionMaxInfinityInput.checked = true;
            this.junctionMaxThresholdInput.value = '';
            this.junctionMaxThresholdRange.value = String(clampNumber(this._junctionMaxLastFinite, 0, 200, 200));
            return;
        }
        this.junctionMaxInfinityInput.checked = false;
        this._junctionMaxLastFinite = v;
        this.junctionMaxThresholdRange.value = String(clampNumber(v, 0, 200, 0));
        this.junctionMaxThresholdInput.value = String(v);
    }

    setOnConnectorDebugToggle(fn) {
        this._onConnectorDebugToggle = fn;
    }

    setOnHoverOutlineToggle(fn) {
        this._onHoverOutlineToggle = fn;
    }

    setOnCollisionDebugToggle(fn) {
        this._onCollisionDebugToggle = fn;
    }

    setOnTreesToggle(fn) {
        this._onTreesToggle = fn;
    }

    setOnRoadEdgesToggle(fn) {
        this._onRoadEdgesToggle = fn;
    }

    setOnRoadCrossingsToggle(fn) {
        this._onRoadCrossingsToggle = fn;
    }

    setOnRoadCenterlineToggle(fn) {
        this._onRoadCenterlineToggle = fn;
    }

    setOnRoadDirectionLinesToggle(fn) {
        this._onRoadDirectionLinesToggle = fn;
    }

    setOnRoadEndpointsToggle(fn) {
        this._onRoadEndpointsToggle = fn;
    }

    setOnRoadRenderModeChange(fn) {
        this._onRoadRenderModeChange = fn;
    }

    setOnTrimThresholdFactorChange(fn) {
        this._onTrimThresholdFactorChange = fn;
    }

    setOnJunctionParamsChange(fn) {
        this._onJunctionParamsChange = fn;
    }

    attach(parent = document.body) {
        if (!this.root.isConnected) parent.appendChild(this.root);
    }

    show() {
        this.attach(document.body);
        this.root.classList.remove('hidden');
    }

    hide() {
        this.root.classList.add('hidden');
    }

    destroy() {
        if (this._junctionEmitTimer) {
            clearTimeout(this._junctionEmitTimer);
            this._junctionEmitTimer = 0;
        }
        if (this._trimEmitTimer) {
            clearTimeout(this._trimEmitTimer);
            this._trimEmitTimer = 0;
        }
        if (this.root.isConnected) this.root.remove();
    }

    _syncMinimizeUi() {
        this.root.classList.toggle('is-minimized', this._minimized);
        applyMaterialSymbolToButton(this.minimizeBtn, this._minimized
            ? { name: 'expand_less', label: 'Expand Map Debugger panel', size: 'sm' }
            : { name: 'expand_more', label: 'Minimize Map Debugger panel', size: 'sm' }
        );
    }

    _setRoadRenderMode(mode) {
        const next = mode === 'normal' ? 'normal' : 'debug';
        this._roadRenderMode = next;
        if (this.modeToggle) {
            this.modeToggle.classList.toggle('is-debug', next === 'debug');
        }
        if (this.modeNormal) this.modeNormal.classList.toggle('is-active', next === 'normal');
        if (this.modeDebug) this.modeDebug.classList.toggle('is-active', next === 'debug');
    }

    _emitJunctionParamsChange() {
        if (!this._onJunctionParamsChange) return;
        if (this._junctionEmitTimer) {
            clearTimeout(this._junctionEmitTimer);
            this._junctionEmitTimer = 0;
        }
        const minThreshold = Number(this.junctionMinThresholdInput?.value);
        const maxRaw = typeof this.junctionMaxThresholdInput?.value === 'string' ? this.junctionMaxThresholdInput.value.trim() : '';
        const maxThreshold = maxRaw ? Number(maxRaw) : null;
        const thresholdFactor = Number(this.junctionThresholdInput?.value);
        const filletRadiusFactor = Number(this.junctionFilletInput?.value);
        if (!Number.isFinite(thresholdFactor) || !Number.isFinite(filletRadiusFactor)) return;
        if (!Number.isFinite(minThreshold)) return;
        if (maxThreshold !== null && !Number.isFinite(maxThreshold)) return;
        this._onJunctionParamsChange({ thresholdFactor, filletRadiusFactor, minThreshold, maxThreshold });
    }

    _queueJunctionParamsChange() {
        if (!this._onJunctionParamsChange) return;
        if (this._junctionEmitTimer) clearTimeout(this._junctionEmitTimer);
        this._junctionEmitTimer = setTimeout(() => {
            this._junctionEmitTimer = 0;
            this._emitJunctionParamsChange();
        }, 120);
    }

    _emitTrimThresholdFactorChange(value) {
        if (!this._onTrimThresholdFactorChange) return;
        if (this._trimEmitTimer) {
            clearTimeout(this._trimEmitTimer);
            this._trimEmitTimer = 0;
        }
        const next = clampNumber(value, 0, 5, 0.1);
        this._onTrimThresholdFactorChange(next);
    }

    _queueTrimThresholdFactorChange(value) {
        if (!this._onTrimThresholdFactorChange) return;
        if (this._trimEmitTimer) clearTimeout(this._trimEmitTimer);
        this._trimEmitTimer = setTimeout(() => {
            this._trimEmitTimer = 0;
            this._emitTrimThresholdFactorChange(value);
        }, 120);
    }
}
