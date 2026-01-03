// src/graphics/gui/rapier_debugger/RapierDebuggerUI.js
const INPUT_LIMITS = {
    engineForce: { min: -20000, max: 20000, step: 100 },
    brakeForce: { min: 0, max: 16000, step: 100 },
    handbrakeForce: { min: 0, max: 18000, step: 100 },
    steerAngle: { min: -0.6, max: 0.6, step: 0.01 }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatNum(value, digits = 2) {
    if (!Number.isFinite(value)) return 'n/a';
    return value.toFixed(digits);
}

function padLeft(str, width) {
    if (str.length >= width) return str;
    return `${' '.repeat(width - str.length)}${str}`;
}

function outNum(value, digits = 2, width = 8) {
    if (!Number.isFinite(value)) return padLeft('n/a', width);
    const normalized = Math.abs(value) < 1e-9 ? 0 : value;
    return padLeft(normalized.toFixed(digits), width);
}

function outVec3(v, digits = 2, width = 8) {
    if (!v) return `${outNum(NaN, digits, width)}, ${outNum(NaN, digits, width)}, ${outNum(NaN, digits, width)}`;
    return `${outNum(v.x, digits, width)}, ${outNum(v.y, digits, width)}, ${outNum(v.z, digits, width)}`;
}

function formatVec3(v, digits = 2) {
    if (!v) return 'n/a';
    return `${formatNum(v.x, digits)}, ${formatNum(v.y, digits)}, ${formatNum(v.z, digits)}`;
}

function makeHudRoot() {
    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.display = 'flex';
    root.style.justifyContent = 'space-between';
    root.style.alignItems = 'flex-start';
    root.style.padding = '16px';
    root.style.gap = '16px';
    root.style.zIndex = '60';
    return root;
}

function stylePanel(el, { interactive = false } = {}) {
    el.style.pointerEvents = interactive ? 'auto' : 'none';
    el.style.userSelect = 'none';
    el.style.minWidth = '280px';
    el.style.maxWidth = '440px';
    el.style.boxSizing = 'border-box';
    el.style.background = 'rgba(10, 14, 20, 0.55)';
    el.style.border = '1px solid rgba(255,255,255,0.12)';
    el.style.backdropFilter = 'blur(8px)';
    el.style.borderRadius = '14px';
    el.style.padding = '12px 14px';
    el.style.color = '#e9f2ff';
    el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
    el.style.boxShadow = '0 10px 28px rgba(0,0,0,0.35)';
}

function makeTitle(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.fontWeight = '800';
    t.style.fontSize = '14px';
    t.style.letterSpacing = '0.6px';
    t.style.textTransform = 'uppercase';
    t.style.opacity = '0.92';
    t.style.marginBottom = '10px';
    return t;
}

function makeLabel(text) {
    const l = document.createElement('div');
    l.textContent = text;
    l.style.fontSize = '12px';
    l.style.fontWeight = '800';
    l.style.opacity = '0.85';
    l.style.marginTop = '10px';
    l.style.marginBottom = '6px';
    l.style.textTransform = 'uppercase';
    l.style.letterSpacing = '0.4px';
    return l;
}

function makeSeparator() {
    const hr = document.createElement('div');
    hr.style.height = '1px';
    hr.style.margin = '10px 0';
    hr.style.background = 'rgba(255,255,255,0.10)';
    return hr;
}

function makeRangeControl({ title, min, max, step, value, fmt }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0 10px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.alignItems = 'baseline';
    head.style.justifyContent = 'space-between';
    head.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';

    const val = document.createElement('div');
    val.style.fontSize = '12px';
    val.style.opacity = '0.75';
    val.textContent = fmt(value);

    head.appendChild(label);
    head.appendChild(val);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.width = '100%';
    input.style.marginTop = '6px';

    wrap.appendChild(head);
    wrap.appendChild(input);

    return { wrap, input, valEl: val, fmt };
}

function makeValueRow(label) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';
    row.style.margin = '6px 0';

    const key = document.createElement('div');
    key.textContent = label;
    key.style.fontSize = '12px';
    key.style.fontWeight = '700';
    key.style.opacity = '0.85';

    const value = document.createElement('div');
    value.textContent = 'n/a';
    value.style.fontSize = '12px';
    value.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    value.style.fontVariantNumeric = 'tabular-nums';
    value.style.whiteSpace = 'pre';
    value.style.textAlign = 'right';
    value.style.opacity = '0.9';

    row.appendChild(key);
    row.appendChild(value);
    return { row, valueEl: value };
}

function makeButton(label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(255,255,255,0.16)';
    btn.style.background = 'rgba(12, 16, 24, 0.9)';
    btn.style.color = '#e9f2ff';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    btn.style.marginRight = '8px';
    return btn;
}

const PRESET_TESTS = [
    {
        id: 'straight_brake',
        label: 'Test 1: Throttle + Brake',
        steps: [
            { duration: 0.6, input: { engineForce: 8000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0 } },
            { duration: 1.8, input: { engineForce: 14000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0 } },
            { duration: 1.0, input: { engineForce: 0, brakeForce: 12000, handbrakeForce: 0, steerAngle: 0 } },
            { duration: 0.6, input: { engineForce: 0, brakeForce: 0, handbrakeForce: 0, steerAngle: 0 } }
        ]
    },
    {
        id: 'steer_sweep',
        label: 'Test 2: Steer Sweep',
        steps: [
            { duration: 0.8, input: { engineForce: 9000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0 } },
            { duration: 1.2, input: { engineForce: 9000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0.35 } },
            { duration: 1.2, input: { engineForce: 9000, brakeForce: 0, handbrakeForce: 0, steerAngle: -0.35 } },
            { duration: 0.8, input: { engineForce: 0, brakeForce: 10000, handbrakeForce: 0, steerAngle: 0 } }
        ]
    },
    {
        id: 'handbrake_turn',
        label: 'Test 3: Handbrake Turn',
        steps: [
            { duration: 0.8, input: { engineForce: 10000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0.25 } },
            { duration: 0.9, input: { engineForce: 10000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0.45 } },
            { duration: 0.8, input: { engineForce: 0, brakeForce: 0, handbrakeForce: 14000, steerAngle: 0.45 } },
            { duration: 0.8, input: { engineForce: 0, brakeForce: 9000, handbrakeForce: 0, steerAngle: 0 } }
        ]
    }
];

export class RapierDebuggerUI {
    constructor({ vehicleConfig = null, tuning = null } = {}) {
        this._hudRoot = null;
        this._inputPanel = null;
        this._outputPanel = null;

        this._inputControls = {};
        this._outputRows = {};
        this._wheelCells = null;
        this._testButtons = [];
        this._statusText = null;
        this._copyButton = null;

        this._enabled = false;
        this._inputs = {
            engineForce: 0,
            brakeForce: 0,
            handbrakeForce: 0,
            steerAngle: 0
        };

        const baseVehicleConfig = vehicleConfig ?? {};
        this._vehicleConfig = {
            spawnHeight: Number.isFinite(baseVehicleConfig.spawnHeight) ? baseVehicleConfig.spawnHeight : 3,
            groundClearance: Number.isFinite(baseVehicleConfig.groundClearance) ? baseVehicleConfig.groundClearance : 0.24,
            restLength: Number.isFinite(baseVehicleConfig.restLength) ? baseVehicleConfig.restLength : 0.35,
            wheelbaseRatio: Number.isFinite(baseVehicleConfig.wheelbaseRatio) ? baseVehicleConfig.wheelbaseRatio : 0.65,
            wheelSideInset: Number.isFinite(baseVehicleConfig.wheelSideInset) ? baseVehicleConfig.wheelSideInset : -0.08
        };

        const baseTuning = tuning ?? {};
        this._tuning = {
            chassis: {
                additionalMass: Number.isFinite(baseTuning.chassis?.additionalMass) ? baseTuning.chassis.additionalMass : 6500,
                linearDamping: Number.isFinite(baseTuning.chassis?.linearDamping) ? baseTuning.chassis.linearDamping : 0.3,
                angularDamping: Number.isFinite(baseTuning.chassis?.angularDamping) ? baseTuning.chassis.angularDamping : 0.8,
                gravityScale: Number.isFinite(baseTuning.chassis?.gravityScale) ? baseTuning.chassis.gravityScale : 1.0,
                ccdEnabled: typeof baseTuning.chassis?.ccdEnabled === 'boolean' ? baseTuning.chassis.ccdEnabled : true
            },
            suspension: {
                maxTravel: Number.isFinite(baseTuning.suspension?.maxTravel) ? baseTuning.suspension.maxTravel : 0.65,
                stiffness: Number.isFinite(baseTuning.suspension?.stiffness) ? baseTuning.suspension.stiffness : 180000,
                compression: Number.isFinite(baseTuning.suspension?.compression) ? baseTuning.suspension.compression : 25000,
                relaxation: Number.isFinite(baseTuning.suspension?.relaxation) ? baseTuning.suspension.relaxation : 30000,
                maxForce: Number.isFinite(baseTuning.suspension?.maxForce) ? baseTuning.suspension.maxForce : 200000
            },
            tires: {
                frictionSlip: Number.isFinite(baseTuning.tires?.frictionSlip) ? baseTuning.tires.frictionSlip : 5.5,
                sideFrictionStiffness: Number.isFinite(baseTuning.tires?.sideFrictionStiffness) ? baseTuning.tires.sideFrictionStiffness : 1.2
            }
        };

        this.onReset = null;
        this.onWheelHover = null;

        this._activeTest = null;
        this._testElapsed = 0;
        this._stepElapsed = 0;
        this._testStepIndex = 0;
        this._telemetry = null;
        this._telemetryMeta = null;
    }

    mount() {
        if (this._hudRoot) return;
        this._buildHud();
        this.setEnabled(false);
    }

    unmount() {
        if (this._hudRoot?.parentElement) {
            this._hudRoot.parentElement.removeChild(this._hudRoot);
        }
        this._hudRoot = null;
        this._inputPanel = null;
        this._outputPanel = null;
        this._inputControls = {};
        this._outputRows = {};
        this._wheelCells = null;
        this._testButtons = [];
        this._statusText = null;
        this._copyButton = null;
        this._activeTest = null;
        this._telemetry = null;
        this._telemetryMeta = null;
    }

    setEnabled(enabled) {
        this._enabled = !!enabled;
        for (const control of Object.values(this._inputControls)) {
            control.input.disabled = !this._enabled || !!this._activeTest;
        }
        for (const btn of this._testButtons) {
            btn.disabled = !this._enabled || !!this._activeTest;
        }
        if (this._statusText && !this._activeTest) {
            this._statusText.textContent = enabled ? 'Ready' : 'Loading…';
        }
    }

    getInputs() {
        return { ...this._inputs };
    }

    getVehicleConfig() {
        return { ...this._vehicleConfig };
    }

    getTuning() {
        return {
            chassis: { ...this._tuning.chassis },
            suspension: { ...this._tuning.suspension },
            tires: { ...this._tuning.tires }
        };
    }

    update(dt, snapshot) {
        const clampedDt = Math.min(Math.max(dt ?? 0, 0), 0.05);
        if (this._activeTest) {
            this._advanceTest(clampedDt);
            if (snapshot) this._recordTelemetry(snapshot);
        }
    }

    setOutputs(snapshot) {
        if (!snapshot || !this._outputRows.status) return;

        this._outputRows.status.valueEl.textContent = snapshot.status ?? '—';

        const body = snapshot.body;
        const pos = body?.position;
        const rot = body?.rotation;
        const linvel = body?.linvel;
        const angvel = body?.angvel;

        const speedMps = snapshot.speedMps ?? 0;
        this._outputRows.speed.valueEl.textContent = `${outNum(speedMps, 2, 8)} m/s`;
        this._outputRows.speedKph.valueEl.textContent = `${outNum(speedMps * 3.6, 1, 8)} km/h`;
        if (this._outputRows.speedProj) {
            const sp = snapshot.speedProjMps ?? 0;
            this._outputRows.speedProj.valueEl.textContent = `${outNum(sp, 2, 8)} m/s (${outNum(sp * 3.6, 1, 8)} km/h)`;
        }
        this._outputRows.yaw.valueEl.textContent = `${outNum((snapshot.yawRad ?? 0) * (180 / Math.PI), 1, 8)} deg`;
        if (this._outputRows.axes) {
            const axes = snapshot.controllerAxes ?? {};
            const up = Number.isFinite(axes.up) ? axes.up : 'n/a';
            const fwd = Number.isFinite(axes.forward) ? axes.forward : 'n/a';
            this._outputRows.axes.valueEl.textContent = `up:${padLeft(String(up), 2)}  fwd:${padLeft(String(fwd), 2)}`;
        }
        if (this._outputRows.mass) {
            this._outputRows.mass.valueEl.textContent = Number.isFinite(snapshot.massKg) ? `${outNum(snapshot.massKg, 0, 8)} kg` : `${outNum(NaN, 0, 8)} kg`;
        }
        this._outputRows.position.valueEl.textContent = outVec3(pos, 2, 8);
        this._outputRows.linvel.valueEl.textContent = outVec3(linvel, 2, 8);
        this._outputRows.angvel.valueEl.textContent = outVec3(angvel, 2, 8);
        this._outputRows.rotation.valueEl.textContent = rot ? `${outNum(rot.x, 3, 8)}, ${outNum(rot.y, 3, 8)}, ${outNum(rot.z, 3, 8)}` : outVec3(null, 3, 8);

        const contacts = snapshot.contacts ?? { count: 0, total: 0 };
        this._outputRows.contacts.valueEl.textContent = `${padLeft(String(contacts.count ?? 0), 2)}/${padLeft(String(contacts.total ?? 0), 2)}`;

        if (this._outputRows.rayDown) {
            const rd = snapshot.rayDown;
            if (!rd) this._outputRows.rayDown.valueEl.textContent = '—';
            else if (rd.hit) this._outputRows.rayDown.valueEl.textContent = `hit:Y  toi:${outNum(rd.toi, 2, 7)}`;
            else this._outputRows.rayDown.valueEl.textContent = `hit:N  toi:${outNum(NaN, 2, 7)}`;
        }

        if (this._outputRows.counts) {
            const world = snapshot.world ?? {};
            this._outputRows.counts.valueEl.textContent = `bodies:${padLeft(String(world.bodies ?? '—'), 4)}  coll:${padLeft(String(world.colliders ?? '—'), 4)}`;
        }

        const wheelCells = this._wheelCells;
        const wheels = snapshot.wheelStates ?? [];
        if (wheelCells && wheels.length) {
            const find = (label) => wheels.find((w) => w?.label === label);
            const toText = (w, fallbackLabel) => {
                if (!w) return '—';
                const contact = w.inContact ? 'Y' : 'N';
                const steerDeg = Number.isFinite(w.steering) ? w.steering * (180 / Math.PI) : NaN;
                const centerLocal = w.centerLocal ?? null;
                const connectionLocal = w.connectionPointLocal ?? null;
                return (
                    `${padLeft(String(w.label ?? fallbackLabel), 2)}  c:${contact}  steer:${outNum(steerDeg, 1, 6)}°\n` +
                    `len:${outNum(w.suspensionLength, 3, 6)}  F:${outNum(w.suspensionForce, 0, 7)}\n` +
                    `impF:${outNum(w.forwardImpulse, 2, 6)} impS:${outNum(w.sideImpulse, 2, 6)}\n` +
                    `C :${outNum(centerLocal?.x, 2, 6)} ${outNum(centerLocal?.y, 2, 6)} ${outNum(centerLocal?.z, 2, 6)}\n` +
                    `P :${outNum(connectionLocal?.x, 2, 6)} ${outNum(connectionLocal?.y, 2, 6)} ${outNum(connectionLocal?.z, 2, 6)}`
                );
            };

            const apply = (cell, wheel) => {
                if (!cell) return;
                if (cell.textEl) {
                    cell.textEl.textContent = toText(wheel, cell.label ?? '—');
                }
                if (cell.knobEl) {
                    const inContact = !!wheel?.inContact;
                    cell.knobEl.style.background = inContact ? '#4cff7a' : '#c8cbd1';
                    cell.knobEl.style.boxShadow = inContact
                        ? '0 0 0 2px rgba(76,255,122,0.25), 0 0 18px rgba(76,255,122,0.25)'
                        : '0 0 0 2px rgba(0,0,0,0.25)';
                    cell.knobEl.style.opacity = inContact ? '1' : '0.85';
                }
            };

            apply(wheelCells.fl, find('FL'));
            apply(wheelCells.fr, find('FR'));
            apply(wheelCells.rl, find('RL'));
            apply(wheelCells.rr, find('RR'));
        }
    }

    _buildHud() {
        const root = makeHudRoot();

        const inputPanel = document.createElement('div');
        stylePanel(inputPanel, { interactive: true });
        inputPanel.appendChild(makeTitle('Rapier Input'));
        inputPanel.style.width = '860px';
        inputPanel.style.minWidth = '860px';
        inputPanel.style.maxWidth = '860px';
        inputPanel.style.maxHeight = 'calc(100vh - 32px)';
        inputPanel.style.overflowY = 'auto';
        inputPanel.style.overflowX = 'hidden';

        const columns = document.createElement('div');
        columns.style.display = 'grid';
        columns.style.gridTemplateColumns = '1fr 1fr';
        columns.style.gap = '10px 18px';

        const leftCol = document.createElement('div');
        leftCol.style.display = 'flex';
        leftCol.style.flexDirection = 'column';

        const rightCol = document.createElement('div');
        rightCol.style.display = 'flex';
        rightCol.style.flexDirection = 'column';

        columns.appendChild(leftCol);
        columns.appendChild(rightCol);
        inputPanel.appendChild(columns);

        leftCol.appendChild(makeLabel('Wheel Forces'));

        this._inputControls.engineForce = makeRangeControl({
            title: 'setWheelEngineForce (N)',
            min: INPUT_LIMITS.engineForce.min,
            max: INPUT_LIMITS.engineForce.max,
            step: INPUT_LIMITS.engineForce.step,
            value: this._inputs.engineForce,
            fmt: (v) => formatNum(v, 0)
        });
        leftCol.appendChild(this._inputControls.engineForce.wrap);

        this._inputControls.brakeForce = makeRangeControl({
            title: 'setWheelBrake (N)',
            min: INPUT_LIMITS.brakeForce.min,
            max: INPUT_LIMITS.brakeForce.max,
            step: INPUT_LIMITS.brakeForce.step,
            value: this._inputs.brakeForce,
            fmt: (v) => formatNum(v, 0)
        });
        leftCol.appendChild(this._inputControls.brakeForce.wrap);

        this._inputControls.handbrakeForce = makeRangeControl({
            title: 'Rear handbrake (N)',
            min: INPUT_LIMITS.handbrakeForce.min,
            max: INPUT_LIMITS.handbrakeForce.max,
            step: INPUT_LIMITS.handbrakeForce.step,
            value: this._inputs.handbrakeForce,
            fmt: (v) => formatNum(v, 0)
        });
        leftCol.appendChild(this._inputControls.handbrakeForce.wrap);

        leftCol.appendChild(makeLabel('Steering'));

        this._inputControls.steerAngle = makeRangeControl({
            title: 'setWheelSteering (rad)',
            min: INPUT_LIMITS.steerAngle.min,
            max: INPUT_LIMITS.steerAngle.max,
            step: INPUT_LIMITS.steerAngle.step,
            value: this._inputs.steerAngle,
            fmt: (v) => `${formatNum(v, 2)} rad`
        });
        leftCol.appendChild(this._inputControls.steerAngle.wrap);

        rightCol.appendChild(makeLabel('Vehicle (Live)'));

        this._inputControls.spawnHeight = makeRangeControl({
            title: 'Spawn height (m)',
            min: 0,
            max: 20,
            step: 0.1,
            value: this._vehicleConfig.spawnHeight,
            fmt: (v) => formatNum(v, 1)
        });
        rightCol.appendChild(this._inputControls.spawnHeight.wrap);

        this._inputControls.groundClearance = makeRangeControl({
            title: 'Ground clearance (m)',
            min: 0,
            max: 1,
            step: 0.01,
            value: this._vehicleConfig.groundClearance,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.groundClearance.wrap);

        this._inputControls.wheelSideInset = makeRangeControl({
            title: 'Wheel side offset (m)',
            min: -0.5,
            max: 0.5,
            step: 0.01,
            value: this._vehicleConfig.wheelSideInset,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.wheelSideInset.wrap);

        this._inputControls.restLength = makeRangeControl({
            title: 'Suspension rest length (m)',
            min: 0.05,
            max: 1.2,
            step: 0.01,
            value: this._vehicleConfig.restLength,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.restLength.wrap);

        this._inputControls.wheelbaseRatio = makeRangeControl({
            title: 'Wheelbase ratio',
            min: 0.3,
            max: 0.95,
            step: 0.01,
            value: this._vehicleConfig.wheelbaseRatio,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.wheelbaseRatio.wrap);

        rightCol.appendChild(makeSeparator());
        rightCol.appendChild(makeLabel('Chassis (Live)'));

        this._inputControls.additionalMass = makeRangeControl({
            title: 'Additional mass (kg)',
            min: 0,
            max: 20000,
            step: 100,
            value: this._tuning.chassis.additionalMass,
            fmt: (v) => formatNum(v, 0)
        });
        rightCol.appendChild(this._inputControls.additionalMass.wrap);

        this._inputControls.linearDamping = makeRangeControl({
            title: 'Linear damping',
            min: 0,
            max: 5,
            step: 0.05,
            value: this._tuning.chassis.linearDamping,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.linearDamping.wrap);

        this._inputControls.angularDamping = makeRangeControl({
            title: 'Angular damping',
            min: 0,
            max: 5,
            step: 0.05,
            value: this._tuning.chassis.angularDamping,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.angularDamping.wrap);

        this._inputControls.gravityScale = makeRangeControl({
            title: 'Gravity scale',
            min: 0,
            max: 2,
            step: 0.05,
            value: this._tuning.chassis.gravityScale,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.gravityScale.wrap);

        rightCol.appendChild(makeSeparator());
        rightCol.appendChild(makeLabel('Suspension (Live)'));

        this._inputControls.suspMaxTravel = makeRangeControl({
            title: 'Max travel (m)',
            min: 0,
            max: 2,
            step: 0.01,
            value: this._tuning.suspension.maxTravel,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.suspMaxTravel.wrap);

        this._inputControls.suspStiffness = makeRangeControl({
            title: 'Stiffness',
            min: 0,
            max: 400000,
            step: 1000,
            value: this._tuning.suspension.stiffness,
            fmt: (v) => formatNum(v, 0)
        });
        rightCol.appendChild(this._inputControls.suspStiffness.wrap);

        this._inputControls.suspCompression = makeRangeControl({
            title: 'Compression',
            min: 0,
            max: 80000,
            step: 500,
            value: this._tuning.suspension.compression,
            fmt: (v) => formatNum(v, 0)
        });
        rightCol.appendChild(this._inputControls.suspCompression.wrap);

        this._inputControls.suspRelaxation = makeRangeControl({
            title: 'Relaxation',
            min: 0,
            max: 80000,
            step: 500,
            value: this._tuning.suspension.relaxation,
            fmt: (v) => formatNum(v, 0)
        });
        rightCol.appendChild(this._inputControls.suspRelaxation.wrap);

        this._inputControls.suspMaxForce = makeRangeControl({
            title: 'Max force',
            min: 0,
            max: 600000,
            step: 5000,
            value: this._tuning.suspension.maxForce,
            fmt: (v) => formatNum(v, 0)
        });
        rightCol.appendChild(this._inputControls.suspMaxForce.wrap);

        rightCol.appendChild(makeSeparator());
        rightCol.appendChild(makeLabel('Tires (Live)'));

        this._inputControls.tireFrictionSlip = makeRangeControl({
            title: 'Friction slip',
            min: 0.5,
            max: 20,
            step: 0.1,
            value: this._tuning.tires.frictionSlip,
            fmt: (v) => formatNum(v, 1)
        });
        rightCol.appendChild(this._inputControls.tireFrictionSlip.wrap);

        this._inputControls.tireSideStiffness = makeRangeControl({
            title: 'Side friction stiffness',
            min: 0.1,
            max: 3,
            step: 0.05,
            value: this._tuning.tires.sideFrictionStiffness,
            fmt: (v) => formatNum(v, 2)
        });
        rightCol.appendChild(this._inputControls.tireSideStiffness.wrap);

        leftCol.appendChild(makeSeparator());
        leftCol.appendChild(makeLabel('Automated Tests'));

        const testsWrap = document.createElement('div');
        testsWrap.style.display = 'flex';
        testsWrap.style.flexWrap = 'wrap';
        testsWrap.style.gap = '8px';
        testsWrap.style.marginBottom = '10px';

        for (const test of PRESET_TESTS) {
            const btn = makeButton(test.label);
            btn.addEventListener('click', () => this._startTest(test));
            testsWrap.appendChild(btn);
            this._testButtons.push(btn);
        }

        leftCol.appendChild(testsWrap);

        const status = document.createElement('div');
        status.style.fontSize = '12px';
        status.style.opacity = '0.8';
        status.textContent = 'Loading…';
        leftCol.appendChild(status);
        this._statusText = status;

        const copyButton = makeButton('Copy Telemetry');
        copyButton.style.display = 'none';
        copyButton.addEventListener('click', () => this._copyTelemetry());
        leftCol.appendChild(copyButton);
        this._copyButton = copyButton;

        const resetButton = makeButton('Reset vehicle');
        resetButton.addEventListener('click', () => this.onReset?.());
        leftCol.appendChild(resetButton);

        const resetInitialButton = makeButton('Reset initial position');
        resetInitialButton.addEventListener('click', () => this._resetInitialPosition());
        leftCol.appendChild(resetInitialButton);

        const outputPanel = document.createElement('div');
        stylePanel(outputPanel, { interactive: false });
        outputPanel.style.width = '420px';
        outputPanel.style.minWidth = '420px';
        outputPanel.style.maxWidth = '420px';
        outputPanel.style.height = '680px';
        outputPanel.style.maxHeight = 'calc(100vh - 32px)';
        outputPanel.style.overflowY = 'auto';
        outputPanel.style.overflowX = 'hidden';
        outputPanel.appendChild(makeTitle('Rapier Output'));

        this._outputRows.status = makeValueRow('Status');
        outputPanel.appendChild(this._outputRows.status.row);

        this._outputRows.speed = makeValueRow('Speed (ctrl)');
        this._outputRows.speedKph = makeValueRow('Speed Kph (ctrl)');
        this._outputRows.speedProj = makeValueRow('Speed (proj)');
        this._outputRows.yaw = makeValueRow('Yaw');
        this._outputRows.axes = makeValueRow('Axes');
        this._outputRows.mass = makeValueRow('Mass');
        this._outputRows.position = makeValueRow('Position');
        this._outputRows.rotation = makeValueRow('Rotation');
        this._outputRows.linvel = makeValueRow('LinVel');
        this._outputRows.angvel = makeValueRow('AngVel');
        this._outputRows.contacts = makeValueRow('Contacts');
        this._outputRows.rayDown = makeValueRow('Ray Down');
        this._outputRows.counts = makeValueRow('World');

        outputPanel.appendChild(this._outputRows.speed.row);
        outputPanel.appendChild(this._outputRows.speedKph.row);
        outputPanel.appendChild(this._outputRows.speedProj.row);
        outputPanel.appendChild(this._outputRows.yaw.row);
        outputPanel.appendChild(this._outputRows.axes.row);
        outputPanel.appendChild(this._outputRows.mass.row);
        outputPanel.appendChild(this._outputRows.position.row);
        outputPanel.appendChild(this._outputRows.rotation.row);
        outputPanel.appendChild(this._outputRows.linvel.row);
        outputPanel.appendChild(this._outputRows.angvel.row);
        outputPanel.appendChild(this._outputRows.contacts.row);
        outputPanel.appendChild(this._outputRows.rayDown.row);
        outputPanel.appendChild(this._outputRows.counts.row);

        outputPanel.appendChild(makeSeparator());
        outputPanel.appendChild(makeLabel('Wheels'));

        const wheelTable = document.createElement('div');
        wheelTable.style.display = 'grid';
        wheelTable.style.gridTemplateColumns = '1fr 1fr';
        wheelTable.style.gap = '10px';

        const headerLeft = document.createElement('div');
        headerLeft.textContent = 'Left';
        headerLeft.style.fontSize = '12px';
        headerLeft.style.fontWeight = '800';
        headerLeft.style.opacity = '0.85';
        headerLeft.style.textTransform = 'uppercase';
        headerLeft.style.letterSpacing = '0.3px';
        headerLeft.style.textAlign = 'center';

        const headerRight = headerLeft.cloneNode(true);
        headerRight.textContent = 'Right';

        const makeWheelCell = (wheelIndex) => {
            const cell = document.createElement('div');
            cell.style.background = 'rgba(255,255,255,0.06)';
            cell.style.border = '1px solid rgba(255,255,255,0.10)';
            cell.style.borderRadius = '12px';
            cell.style.padding = '8px 10px';
            cell.style.position = 'relative';

            const knob = document.createElement('div');
            knob.style.position = 'absolute';
            knob.style.top = '10px';
            knob.style.right = '10px';
            knob.style.width = '11px';
            knob.style.height = '11px';
            knob.style.borderRadius = '999px';
            knob.style.background = '#c8cbd1';
            knob.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.25)';
            knob.style.opacity = '0.85';
            cell.appendChild(knob);

            const text = document.createElement('div');
            text.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
            text.style.fontSize = '12px';
            text.style.fontVariantNumeric = 'tabular-nums';
            text.style.whiteSpace = 'pre';
            text.style.lineHeight = '1.25';
            text.textContent = '—';
            cell.appendChild(text);

            cell.addEventListener('mouseenter', () => this.onWheelHover?.(wheelIndex));
            cell.addEventListener('mouseleave', () => this.onWheelHover?.(null));
            return { root: cell, textEl: text, knobEl: knob };
        };

        wheelTable.appendChild(headerLeft);
        wheelTable.appendChild(headerRight);

        const fl = { ...makeWheelCell(0), label: 'FL' };
        const fr = { ...makeWheelCell(1), label: 'FR' };
        const rl = { ...makeWheelCell(2), label: 'RL' };
        const rr = { ...makeWheelCell(3), label: 'RR' };
        this._wheelCells = { fl, fr, rl, rr };

        wheelTable.appendChild(fl.root);
        wheelTable.appendChild(fr.root);
        wheelTable.appendChild(rl.root);
        wheelTable.appendChild(rr.root);

        outputPanel.appendChild(wheelTable);

        root.appendChild(inputPanel);
        root.appendChild(outputPanel);
        document.body.appendChild(root);

        this._hudRoot = root;
        this._inputPanel = inputPanel;
        this._outputPanel = outputPanel;

        this._wireControls();
    }

    _wireControls() {
        const wire = (control, key) => {
            control.input.addEventListener('input', () => {
                const value = parseFloat(control.input.value);
                this._setInputValue(key, value);
            });
        };

        wire(this._inputControls.engineForce, 'engineForce');
        wire(this._inputControls.brakeForce, 'brakeForce');
        wire(this._inputControls.handbrakeForce, 'handbrakeForce');
        wire(this._inputControls.steerAngle, 'steerAngle');
        wire(this._inputControls.spawnHeight, 'spawnHeight');
        wire(this._inputControls.groundClearance, 'groundClearance');
        wire(this._inputControls.wheelSideInset, 'wheelSideInset');
        wire(this._inputControls.restLength, 'restLength');
        wire(this._inputControls.wheelbaseRatio, 'wheelbaseRatio');
        wire(this._inputControls.additionalMass, 'additionalMass');
        wire(this._inputControls.linearDamping, 'linearDamping');
        wire(this._inputControls.angularDamping, 'angularDamping');
        wire(this._inputControls.gravityScale, 'gravityScale');
        wire(this._inputControls.suspMaxTravel, 'suspMaxTravel');
        wire(this._inputControls.suspStiffness, 'suspStiffness');
        wire(this._inputControls.suspCompression, 'suspCompression');
        wire(this._inputControls.suspRelaxation, 'suspRelaxation');
        wire(this._inputControls.suspMaxForce, 'suspMaxForce');
        wire(this._inputControls.tireFrictionSlip, 'tireFrictionSlip');
        wire(this._inputControls.tireSideStiffness, 'tireSideStiffness');
    }

    _setInputValue(key, value) {
        let next = value;
        if (INPUT_LIMITS[key]) {
            const limits = INPUT_LIMITS[key];
            next = clamp(value, limits.min, limits.max);
            this._inputs[key] = next;
        } else if (key === 'spawnHeight') {
            this._vehicleConfig.spawnHeight = next;
        } else if (key === 'groundClearance') {
            this._vehicleConfig.groundClearance = next;
        } else if (key === 'wheelSideInset') {
            this._vehicleConfig.wheelSideInset = next;
        } else if (key === 'restLength') {
            this._vehicleConfig.restLength = next;
        } else if (key === 'wheelbaseRatio') {
            this._vehicleConfig.wheelbaseRatio = next;
        } else if (key === 'additionalMass') {
            this._tuning.chassis.additionalMass = next;
        } else if (key === 'linearDamping') {
            this._tuning.chassis.linearDamping = next;
        } else if (key === 'angularDamping') {
            this._tuning.chassis.angularDamping = next;
        } else if (key === 'gravityScale') {
            this._tuning.chassis.gravityScale = next;
        } else if (key === 'suspMaxTravel') {
            this._tuning.suspension.maxTravel = next;
        } else if (key === 'suspStiffness') {
            this._tuning.suspension.stiffness = next;
        } else if (key === 'suspCompression') {
            this._tuning.suspension.compression = next;
        } else if (key === 'suspRelaxation') {
            this._tuning.suspension.relaxation = next;
        } else if (key === 'suspMaxForce') {
            this._tuning.suspension.maxForce = next;
        } else if (key === 'tireFrictionSlip') {
            this._tuning.tires.frictionSlip = next;
        } else if (key === 'tireSideStiffness') {
            this._tuning.tires.sideFrictionStiffness = next;
        }

        const control = this._inputControls[key];
        if (control) {
            control.input.value = String(next);
            control.valEl.textContent = control.fmt(next);
        }
    }

    _startTest(test) {
        if (!test) return;
        this._activeTest = test;
        this._telemetry = [];
        this._telemetryMeta = {
            id: test.id,
            label: test.label,
            startedAt: new Date().toISOString()
        };
        this._testElapsed = 0;
        this._stepElapsed = 0;
        this._testStepIndex = 0;
        this._copyButton.style.display = 'none';
        this._statusText.textContent = `Running ${test.label}…`;

        this.setEnabled(this._enabled);
    }

    _advanceTest(dt) {
        if (!this._activeTest) return;

        const steps = this._activeTest.steps ?? [];
        const curStep = steps[this._testStepIndex];
        if (!curStep) {
            this._finishTest();
            return;
        }

        this._testElapsed += dt;
        this._stepElapsed += dt;

        if (this._stepElapsed >= curStep.duration) {
            this._stepElapsed = 0;
            this._testStepIndex += 1;
            if (this._testStepIndex >= steps.length) {
                this._finishTest();
                return;
            }
        }

        const active = steps[this._testStepIndex];
        if (active?.input) {
            for (const [k, v] of Object.entries(active.input)) {
                if (Number.isFinite(v)) this._setInputValue(k, v);
            }
        }
    }

    _finishTest() {
        const label = this._activeTest?.label ?? 'Test';
        this._activeTest = null;
        this._statusText.textContent = `${label} complete`;
        if (this._copyButton) this._copyButton.style.display = this._telemetry?.length ? '' : 'none';
        this.setEnabled(this._enabled);
    }

    _recordTelemetry(snapshot) {
        if (!this._telemetry) return;
        this._telemetry.push({
            t: this._testElapsed,
            input: { ...this._inputs },
            output: snapshot
        });
    }

    async _copyTelemetry() {
        if (!this._telemetry || !this._telemetryMeta) return;
        const payload = JSON.stringify({ meta: this._telemetryMeta, frames: this._telemetry }, null, 2);
        try {
            await navigator.clipboard.writeText(payload);
            if (this._statusText) this._statusText.textContent = 'Telemetry copied';
        } catch {
            if (this._statusText) this._statusText.textContent = 'Clipboard blocked';
        }
    }

    _resetInitialPosition() {
        this._activeTest = null;
        this._testElapsed = 0;
        this._stepElapsed = 0;
        this._testStepIndex = 0;
        this._telemetry = null;
        this._telemetryMeta = null;
        if (this._copyButton) this._copyButton.style.display = 'none';

        this._setInputValue('engineForce', 0);
        this._setInputValue('brakeForce', 0);
        this._setInputValue('handbrakeForce', 0);
        this._setInputValue('steerAngle', 0);

        if (this._statusText) this._statusText.textContent = this._enabled ? 'Ready' : 'Loading…';
        this.setEnabled(this._enabled);
        this.onReset?.();
    }
}
