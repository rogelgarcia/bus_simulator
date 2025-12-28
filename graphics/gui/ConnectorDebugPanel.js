// graphics/gui/ConnectorDebugPanel.js
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
        onHoldRotateChange = null,
        onLineVisibilityChange = null,
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
        this._onRadiusChange = onRadiusChange;
        this._onCopy = onCopy;

        this.holdRotateInput.addEventListener('change', () => {
            if (this._onHoldRotateChange) this._onHoldRotateChange(this.holdRotateInput.checked);
        });

        this.radiusInput.addEventListener('input', () => {
            if (!this._onRadiusChange) return;
            const next = parseFloat(this.radiusInput.value);
            if (Number.isFinite(next)) this._onRadiusChange(next);
        });

        this.copyButton.addEventListener('click', () => {
            if (this._onCopy) this._onCopy();
        });
    }

    setData(data = {}) {
        const segments = Array.isArray(data.segments) ? data.segments : [];
        const metrics = data.metrics ?? {};
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
