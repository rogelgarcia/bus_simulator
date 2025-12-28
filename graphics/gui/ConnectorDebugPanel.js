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

export class ConnectorDebugPanel {
    constructor({
        radius = 0,
        holdRotate = true,
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

        this._lineVisibility = {
            LSL: true,
            RSR: true,
            LSR: true,
            RSL: true,
            ...(lineVisibility ?? {})
        };
        this._lineInputs = new Map();
        const types = ['LSL', 'RSR', 'LSR', 'RSL'];
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
        const arc0 = data.arc0 ?? {};
        const arc1 = data.arc1 ?? {};
        const straight = data.straight ?? {};
        const quality = data.quality ?? {};
        const lines = [
            `p0: ${fmtVec2(data.p0)}`,
            `dir0: ${fmtVec2(data.dir0)}`,
            `p1: ${fmtVec2(data.p1)}`,
            `dir1: ${fmtVec2(data.dir1)}`,
            `type: ${data.type ?? 'none'}`,
            `R: ${fmtNum(data.radius)}`,
            `arc0 center: ${fmtVec2(arc0.center)}`,
            `arc0 angles: ${fmtNum(arc0.startAngle)} , ${fmtNum(arc0.deltaAngle)}`,
            `arc0 delta deg: ${fmtNum(radToDeg(arc0.deltaAngle))}`,
            `arc0 length: ${fmtNum(arc0.length)}`,
            `straight: ${fmtVec2Pair(straight.start, straight.end)}`,
            `straight length: ${fmtNum(straight.length)}`,
            `arc1 center: ${fmtVec2(arc1.center)}`,
            `arc1 angles: ${fmtNum(arc1.startAngle)} , ${fmtNum(arc1.deltaAngle)}`,
            `arc1 delta deg: ${fmtNum(radToDeg(arc1.deltaAngle))}`,
            `arc1 length: ${fmtNum(arc1.length)}`,
            `total length: ${fmtNum(data.totalLength)}`,
            `tangent dot0: ${fmtNum(quality.tangentDot0)}`,
            `tangent dot1: ${fmtNum(quality.tangentDot1)}`,
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
