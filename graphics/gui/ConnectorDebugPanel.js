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
        autoSelect = false,
        onHoldRotateChange = null,
        onLineVisibilityChange = null,
        onAutoSelectChange = null,
        onRadiusChange = null,
        onCopy = null
    } = {}) {
        this.root = document.createElement('div');
        this.root.className = 'connector-debug-panel hidden';

        this.title = document.createElement('div');
        this.title.className = 'connector-debug-title';
        this.title.textContent = 'Connector Debugger';

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
        this.linesTitle.className = 'connector-debug-lines-title';
        this.linesTitle.textContent = 'Lines';

        this.linesGroup.appendChild(this.linesTitle);

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
        this.linesGroup.appendChild(this.autoSelectLabel);

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
            this.linesGroup.appendChild(label);
            this._lineInputs.set(type, input);
            this._lineLabels.set(type, label);

            input.addEventListener('change', () => {
                this._lineVisibility[type] = input.checked;
                if (this._onLineVisibilityChange) {
                    this._onLineVisibilityChange({ ...this._lineVisibility });
                }
            });
        }

        this.copyButton = document.createElement('button');
        this.copyButton.type = 'button';
        this.copyButton.className = 'connector-debug-copy';
        this.copyButton.textContent = 'Copy';

        this.controls.appendChild(this.holdRotateLabel);
        this.controls.appendChild(this.radiusLabel);
        this.controls.appendChild(this.linesGroup);
        this.controls.appendChild(this.copyButton);

        this.readout = document.createElement('pre');
        this.readout.className = 'connector-debug-readout';

        this.root.appendChild(this.title);
        this.root.appendChild(this.controls);
        this.root.appendChild(this.readout);

        this._onHoldRotateChange = onHoldRotateChange;
        this._onLineVisibilityChange = onLineVisibilityChange;
        this._onAutoSelectChange = onAutoSelectChange;
        this._onRadiusChange = onRadiusChange;
        this._onCopy = onCopy;
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

        this.copyButton.addEventListener('click', () => {
            if (this._onCopy) this._onCopy();
        });
    }

    setData(data = {}) {
        const segments = Array.isArray(data.segments) ? data.segments : [];
        const metrics = data.metrics ?? {};
        const selectedType = (data.type && data.type !== 'none') ? data.type : null;
        this.setSelectedType(selectedType);
        const lines = [
            `p0: ${fmtVec2(data.p0)}`,
            `dir0: ${fmtVec2(data.dir0)}`,
            `p1: ${fmtVec2(data.p1)}`,
            `dir1: ${fmtVec2(data.dir1)}`,
            `type: ${data.type ?? 'none'}`,
            `R: ${fmtNum(data.radius)}`,
            `segments: ${segments.length ? segments.map(fmtSegment).join(' | ') : 'n/a'}`,
            `total length: ${fmtNum(data.totalLength)}`,
            `end pos error: ${fmtNum(metrics.endPoseErrorPos)}`,
            `end dir error: ${fmtNum(metrics.endPoseErrorDir)}`,
            `tangency dot0: ${fmtNum(metrics.tangencyDotAtJoin0)}`,
            `tangency dot1: ${fmtNum(metrics.tangencyDotAtJoin1)}`,
            `feasible: ${data.feasible ? 'true' : 'false'}`,
            `error: ${data.error ?? 'none'}`
        ];
        this.readout.textContent = lines.join('\n');
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
