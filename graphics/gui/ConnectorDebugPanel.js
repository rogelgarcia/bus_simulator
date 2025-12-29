// graphics/gui/ConnectorDebugPanel.js
function fmtNum(v, digits = 3) {
    if (!Number.isFinite(v)) return 'n/a';
    return Number(v).toFixed(digits);
}

function fmtVec2(v, digits = 3) {
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.z)) return 'n/a';
    return `(${fmtNum(v.x, digits)}, ${fmtNum(v.z, digits)})`;
}

function fmtVec2Pair(a, b, digits = 3) {
    if (!a || !b) return 'n/a';
    return `${fmtVec2(a, digits)} -> ${fmtVec2(b, digits)}`;
}

function radToDeg(rad) {
    if (!Number.isFinite(rad)) return NaN;
    return rad * (180 / Math.PI);
}

function fmtSegment(segment) {
    if (!segment || !segment.type) return 'n/a';
    if (segment.type === 'ARC') {
        const turn = segment.turnDir ? ` ${segment.turnDir}` : '';
        return `ARC${turn} len ${fmtNum(segment.length)} dAng ${fmtNum(radToDeg(segment.deltaAngle))}`;
    }
    if (segment.type === 'STRAIGHT') {
        return `S len ${fmtNum(segment.length)}`;
    }
    return segment.type;
}

export class ConnectorDebugPanel {
    constructor({
        radius = 0,
        holdRotate = true,
        pathTypes = null,
        lineVisibility = null,
        displayEnabled = true,
        autoSelect = false,
        onHoldRotateChange = null,
        onLineVisibilityChange = null,
        onDisplayChange = null,
        onAutoSelectChange = null,
        onRadiusChange = null,
        onCopy = null,
        curbsEnabled = false,
        onCurbsToggleChange = null
    } = {}) {
        this.root = document.createElement('div');
        this.root.className = 'connector-debug-stack hidden';

        this.curbsPanel = document.createElement('div');
        this.curbsPanel.className = 'connector-curb-panel';

        this.curbsHeader = document.createElement('div');
        this.curbsHeader.className = 'connector-debug-header';

        this.curbsPanelTitle = document.createElement('div');
        this.curbsPanelTitle.className = 'connector-debug-title';
        this.curbsPanelTitle.textContent = 'Curbs debugger';

        this.curbsHeader.appendChild(this.curbsPanelTitle);

        this.debugPanel = document.createElement('div');
        this.debugPanel.className = 'connector-debug-panel';

        this.title = document.createElement('div');
        this.title.className = 'connector-debug-title';
        this.title.textContent = 'Connector Debugger';

        this.copyButton = document.createElement('button');
        this.copyButton.type = 'button';
        this.copyButton.className = 'connector-debug-copy';
        this.copyButton.textContent = 'Copy';

        this.header = document.createElement('div');
        this.header.className = 'connector-debug-header';
        this.header.appendChild(this.title);
        this.header.appendChild(this.copyButton);

        this.controls = document.createElement('div');
        this.controls.className = 'connector-debug-controls';

        this.holdRotateLabel = document.createElement('label');
        this.holdRotateLabel.className = 'connector-debug-toggle';

        this.holdRotateText = document.createElement('span');
        this.holdRotateText.textContent = 'Hold rotate';

        this.holdRotateInput = document.createElement('input');
        this.holdRotateInput.type = 'checkbox';
        this.holdRotateInput.checked = !!holdRotate;

        this.holdRotateLabel.appendChild(this.holdRotateText);
        this.holdRotateLabel.appendChild(this.holdRotateInput);

        this.radiusLabel = document.createElement('label');
        this.radiusLabel.className = 'connector-debug-radius';

        this.radiusText = document.createElement('span');
        this.radiusText.textContent = 'Radius';

        this.radiusInput = document.createElement('input');
        this.radiusInput.type = 'number';
        this.radiusInput.min = '0.1';
        this.radiusInput.step = '0.1';
        this.radiusInput.value = Number.isFinite(radius) ? String(radius) : '0';

        this.radiusLabel.appendChild(this.radiusText);
        this.radiusLabel.appendChild(this.radiusInput);

        this.linesGroup = document.createElement('div');
        this.linesGroup.className = 'connector-debug-lines';

        this.linesTitle = document.createElement('span');
        this.linesTitle.className = 'connector-debug-lines-title connector-debug-label';
        this.linesTitle.textContent = 'Lines';

        this.linesAutoRow = document.createElement('div');
        this.linesAutoRow.className = 'connector-debug-lines-auto';

        this.linesPathsRow = document.createElement('div');
        this.linesPathsRow.className = 'connector-debug-lines-paths';

        this.linesGroup.appendChild(this.linesTitle);
        this.linesGroup.appendChild(this.linesAutoRow);
        this.linesGroup.appendChild(this.linesPathsRow);

        this.curbsGroup = document.createElement('div');
        this.curbsGroup.className = 'connector-debug-curbs';

        this.curbsTitle = document.createElement('span');
        this.curbsTitle.className = 'connector-debug-curbs-title connector-debug-label';
        this.curbsTitle.textContent = 'Curbs';

        this.curbsToggleLabel = document.createElement('label');
        this.curbsToggleLabel.className = 'connector-debug-toggle-switch connector-debug-curbs-toggle';
        this.curbsToggleLabel.title = 'Auto build curbs';

        this.curbsToggleInput = document.createElement('input');
        this.curbsToggleInput.type = 'checkbox';
        this.curbsToggleInput.checked = !!curbsEnabled;

        this.curbsToggleText = document.createElement('span');
        this.curbsToggleText.textContent = 'Enabled';

        this.curbsToggleLabel.appendChild(this.curbsToggleInput);
        this.curbsToggleLabel.appendChild(this.curbsToggleText);
        this.curbsGroup.appendChild(this.curbsTitle);
        this.curbsGroup.appendChild(this.curbsToggleLabel);

        this.displayLabel = document.createElement('label');
        this.displayLabel.className = 'connector-debug-toggle-switch connector-debug-line-display';
        this.displayLabel.title = 'Show debug paths';

        this.displayInput = document.createElement('input');
        this.displayInput.type = 'checkbox';
        this.displayInput.checked = !!displayEnabled;

        this.displayText = document.createElement('span');
        this.displayText.textContent = 'Display';

        this.displayLabel.appendChild(this.displayInput);
        this.displayLabel.appendChild(this.displayText);

        this.autoSelectLabel = document.createElement('label');
        this.autoSelectLabel.className = 'connector-debug-toggle-switch connector-debug-line-auto';
        this.autoSelectLabel.title = 'Show only selected path';

        this.autoSelectInput = document.createElement('input');
        this.autoSelectInput.type = 'checkbox';
        this.autoSelectInput.checked = !!autoSelect;

        this.autoSelectText = document.createElement('span');
        this.autoSelectText.textContent = 'Auto';

        this.autoSelectLabel.appendChild(this.autoSelectInput);
        this.autoSelectLabel.appendChild(this.autoSelectText);
        this.linesAutoRow.appendChild(this.displayLabel);
        this.linesAutoRow.appendChild(this.autoSelectLabel);

        const types = (Array.isArray(pathTypes) && pathTypes.length)
            ? pathTypes.slice()
            : ['LSL', 'RSR', 'LSR', 'RSL', 'RLR', 'LRL'];
        this._lineVisibility = {};
        for (const type of types) this._lineVisibility[type] = true;
        if (lineVisibility) {
            for (const [key, value] of Object.entries(lineVisibility)) {
                this._lineVisibility[key] = value;
            }
        }
        this._lineInputs = new Map();
        this._lineLabels = new Map();
        for (const type of types) {
            const label = document.createElement('label');
            label.className = 'connector-debug-line-toggle';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = !!this._lineVisibility[type];

            const text = document.createElement('span');
            text.textContent = type;

            label.appendChild(input);
            label.appendChild(text);
            this.linesPathsRow.appendChild(label);
            this._lineInputs.set(type, input);
            this._lineLabels.set(type, label);

            input.addEventListener('change', () => {
                this._lineVisibility[type] = input.checked;
                if (this._onLineVisibilityChange) {
                    this._onLineVisibilityChange({ ...this._lineVisibility });
                }
            });
        }

        this.controls.appendChild(this.holdRotateLabel);
        this.controls.appendChild(this.radiusLabel);
        this.controls.appendChild(this.linesGroup);

        const makeCell = (tag, className, text = '') => {
            const cell = document.createElement(tag);
            cell.className = className;
            if (text) cell.textContent = text;
            return cell;
        };

        this.infoTable = document.createElement('table');
        this.infoTable.className = 'connector-debug-info-table';
        this.infoBody = document.createElement('tbody');
        this.infoTable.appendChild(this.infoBody);
        this.infoWrap = document.createElement('div');
        this.infoWrap.className = 'connector-debug-info-wrap';
        this.infoWrap.appendChild(this.infoTable);

        const addSectionRow = (label, body) => {
            const row = document.createElement('tr');
            const titleCell = makeCell('th', 'connector-debug-section-title connector-debug-label', label);
            const bodyCell = makeCell('td', 'connector-debug-section-body');
            bodyCell.appendChild(body);
            row.appendChild(titleCell);
            row.appendChild(bodyCell);
            this.infoBody.appendChild(row);
        };

        this.polesTable = document.createElement('table');
        this.polesTable.className = 'connector-debug-subtable connector-debug-poles-table';
        const polesBody = document.createElement('tbody');
        this.polesTable.appendChild(polesBody);
        const polesHeader = document.createElement('tr');
        polesHeader.appendChild(makeCell('th', 'connector-debug-subhead connector-debug-subhead-label', ''));
        polesHeader.appendChild(makeCell('th', 'connector-debug-subhead', 'Pole 0'));
        polesHeader.appendChild(makeCell('th', 'connector-debug-subhead', 'Pole 1'));
        polesBody.appendChild(polesHeader);
        const polePosRow = document.createElement('tr');
        polePosRow.appendChild(makeCell('th', 'connector-debug-subhead connector-debug-subhead-label', 'Pos'));
        this.pole0PosCell = makeCell('td', 'connector-debug-cell-value');
        this.pole1PosCell = makeCell('td', 'connector-debug-cell-value');
        polePosRow.appendChild(this.pole0PosCell);
        polePosRow.appendChild(this.pole1PosCell);
        polesBody.appendChild(polePosRow);
        const poleDirRow = document.createElement('tr');
        poleDirRow.appendChild(makeCell('th', 'connector-debug-subhead connector-debug-subhead-label', 'Dir'));
        this.pole0DirCell = makeCell('td', 'connector-debug-cell-value');
        this.pole1DirCell = makeCell('td', 'connector-debug-cell-value');
        poleDirRow.appendChild(this.pole0DirCell);
        poleDirRow.appendChild(this.pole1DirCell);
        polesBody.appendChild(poleDirRow);

        this.segmentsTable = document.createElement('table');
        this.segmentsTable.className = 'connector-debug-subtable connector-debug-segments-table';
        const segmentsBody = document.createElement('tbody');
        this.segmentsTable.appendChild(segmentsBody);
        const makeSegmentRow = (label, targetCells) => {
            const row = document.createElement('tr');
            row.appendChild(makeCell('th', 'connector-debug-subhead connector-debug-subhead-label', label));
            for (const cell of targetCells) row.appendChild(cell);
            segmentsBody.appendChild(row);
        };
        this.segmentTypeCells = [
            makeCell('td', 'connector-debug-cell-value connector-debug-segment-type'),
            makeCell('td', 'connector-debug-cell-value connector-debug-segment-type'),
            makeCell('td', 'connector-debug-cell-value connector-debug-segment-type')
        ];
        this.segmentLengthCells = [
            makeCell('td', 'connector-debug-cell-value'),
            makeCell('td', 'connector-debug-cell-value'),
            makeCell('td', 'connector-debug-cell-value')
        ];
        this.segmentAngleCells = [
            makeCell('td', 'connector-debug-cell-value'),
            makeCell('td', 'connector-debug-cell-value'),
            makeCell('td', 'connector-debug-cell-value')
        ];
        const segmentTypeRow = document.createElement('tr');
        segmentTypeRow.appendChild(makeCell('th', 'connector-debug-subhead connector-debug-subhead-label', ''));
        for (const cell of this.segmentTypeCells) segmentTypeRow.appendChild(cell);
        segmentsBody.appendChild(segmentTypeRow);
        makeSegmentRow('Len', this.segmentLengthCells);
        makeSegmentRow('dAng', this.segmentAngleCells);

        this.metaTable = document.createElement('table');
        this.metaTable.className = 'connector-debug-subtable connector-debug-meta-table';
        const metaBody = document.createElement('tbody');
        this.metaTable.appendChild(metaBody);
        this.metaValues = {};
        const addMetaRowPair = (labelA, keyA, labelB = '', keyB = null) => {
            const row = document.createElement('tr');
            row.appendChild(makeCell('th', 'connector-debug-subhead connector-debug-subhead-label', labelA));
            const valueA = makeCell('td', 'connector-debug-cell-value');
            row.appendChild(valueA);
            this.metaValues[keyA] = valueA;
            const labelCellB = makeCell('th', 'connector-debug-subhead connector-debug-subhead-label', labelB);
            if (!labelB) labelCellB.classList.add('connector-debug-subhead-empty');
            row.appendChild(labelCellB);
            const valueB = makeCell('td', 'connector-debug-cell-value');
            if (keyB) this.metaValues[keyB] = valueB;
            row.appendChild(valueB);
            metaBody.appendChild(row);
        };
        addMetaRowPair('Type', 'type', 'Pos err', 'endPosError');
        addMetaRowPair('Radius', 'radius', 'Dir err', 'endDirError');
        addMetaRowPair('Length', 'totalLength', 'Feasible', 'feasible');
        addMetaRowPair('', 'errorSpacer', 'Error', 'error');

        addSectionRow('Poles', this.polesTable);
        addSectionRow('Segments', this.segmentsTable);
        addSectionRow('Info', this.metaTable);

        this.curbsPanel.appendChild(this.curbsHeader);
        this.curbsPanel.appendChild(this.curbsGroup);
        this.debugPanel.appendChild(this.header);
        this.debugPanel.appendChild(this.controls);
        this.debugPanel.appendChild(this.infoWrap);
        this.root.appendChild(this.curbsPanel);
        this.root.appendChild(this.debugPanel);

        this._onHoldRotateChange = onHoldRotateChange;
        this._onLineVisibilityChange = onLineVisibilityChange;
        this._onDisplayChange = onDisplayChange;
        this._onAutoSelectChange = onAutoSelectChange;
        this._onRadiusChange = onRadiusChange;
        this._onCopy = onCopy;
        this._onCurbsToggleChange = onCurbsToggleChange;
        this._selectedType = null;
        this._autoSelect = false;

        this._setAutoSelectState(!!autoSelect);

        this.holdRotateInput.addEventListener('change', () => {
            if (this._onHoldRotateChange) this._onHoldRotateChange(this.holdRotateInput.checked);
        });

        this.radiusInput.addEventListener('input', () => {
            if (!this._onRadiusChange) return;
            const next = parseFloat(this.radiusInput.value);
            if (Number.isFinite(next)) this._onRadiusChange(next);
        });

        this.autoSelectInput.addEventListener('change', () => {
            this._setAutoSelectState(this.autoSelectInput.checked);
            if (this._onAutoSelectChange) this._onAutoSelectChange(this.autoSelectInput.checked);
        });

        this.displayInput.addEventListener('change', () => {
            if (this._onDisplayChange) this._onDisplayChange(this.displayInput.checked);
        });

        this.copyButton.addEventListener('click', () => {
            if (this._onCopy) this._onCopy();
        });

        this.curbsToggleInput.addEventListener('change', () => {
            if (this._onCurbsToggleChange) this._onCurbsToggleChange(this.curbsToggleInput.checked);
        });
    }

    setData(data = {}) {
        const segments = Array.isArray(data.segments) ? data.segments : [];
        const metrics = data.metrics ?? {};
        const selectedType = (data.type && data.type !== 'none') ? data.type : null;
        this.setSelectedType(selectedType);
        if (this.pole0PosCell) this.pole0PosCell.textContent = fmtVec2(data.p0);
        if (this.pole1PosCell) this.pole1PosCell.textContent = fmtVec2(data.p1);
        if (this.pole0DirCell) this.pole0DirCell.textContent = fmtVec2(data.dir0);
        if (this.pole1DirCell) this.pole1DirCell.textContent = fmtVec2(data.dir1);

        const typeChars = (selectedType && selectedType.length === 3)
            ? selectedType.split('')
            : segments.map((seg) => {
                if (!seg) return '?';
                if (seg.type === 'STRAIGHT') return 'S';
                if (seg.type === 'ARC') return seg.turnDir ?? '?';
                return '?';
            });
        for (let i = 0; i < this.segmentTypeCells.length; i++) {
            this.segmentTypeCells[i].textContent = typeChars[i] ?? 'n/a';
        }
        for (let i = 0; i < this.segmentLengthCells.length; i++) {
            const seg = segments[i];
            this.segmentLengthCells[i].textContent = seg ? fmtNum(seg.length) : 'n/a';
        }
        for (let i = 0; i < this.segmentAngleCells.length; i++) {
            const seg = segments[i];
            if (!seg) {
                this.segmentAngleCells[i].textContent = 'n/a';
                continue;
            }
            if (seg.type === 'ARC') {
                this.segmentAngleCells[i].textContent = fmtNum(radToDeg(seg.deltaAngle));
            } else {
                this.segmentAngleCells[i].textContent = '-';
            }
        }

        if (this.metaValues) {
            this.metaValues.type.textContent = data.type ?? 'none';
            this.metaValues.radius.textContent = fmtNum(data.radius);
            this.metaValues.totalLength.textContent = fmtNum(data.totalLength);
            this.metaValues.endPosError.textContent = fmtNum(metrics.endPoseErrorPos);
            this.metaValues.endDirError.textContent = fmtNum(metrics.endPoseErrorDir);
            this.metaValues.feasible.textContent = data.feasible ? 'true' : 'false';
            this.metaValues.error.textContent = data.error ?? 'none';
            if (this.metaValues.errorSpacer) this.metaValues.errorSpacer.textContent = '';
        }
    }

    setLineVisibility(visibility = {}) {
        for (const [type, input] of this._lineInputs.entries()) {
            if (type in visibility) {
                const isVisible = !!visibility[type];
                input.checked = isVisible;
                this._lineVisibility[type] = isVisible;
            }
        }
    }

    setSelectedType(type) {
        if (this._selectedType === type) return;
        if (this._selectedType && this._lineLabels.has(this._selectedType)) {
            this._lineLabels.get(this._selectedType).classList.remove('is-selected');
        }
        this._selectedType = type;
        if (type && this._lineLabels.has(type)) {
            this._lineLabels.get(type).classList.add('is-selected');
        }
    }

    setAutoSelect(autoSelect) {
        this._setAutoSelectState(!!autoSelect);
    }

    setCurbsEnabled(enabled) {
        if (this.curbsToggleInput) this.curbsToggleInput.checked = !!enabled;
    }

    setTourActive(active) {
        this.root.classList.toggle('is-tour', !!active);
    }

    _setAutoSelectState(autoSelect) {
        this._autoSelect = !!autoSelect;
        if (this.autoSelectInput) this.autoSelectInput.checked = this._autoSelect;
        for (const input of this._lineInputs.values()) {
            input.disabled = this._autoSelect;
        }
    }

    setRadius(radius) {
        if (!Number.isFinite(radius)) return;
        this.radiusInput.value = String(radius);
    }

    setHoldRotate(holdRotate) {
        this.holdRotateInput.checked = !!holdRotate;
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
        if (this.root.isConnected) this.root.remove();
    }
}
