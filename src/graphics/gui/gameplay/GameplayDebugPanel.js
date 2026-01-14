// src/graphics/gui/gameplay/GameplayDebugPanel.js
// Lightweight gameplay debug overlay (DOM only).

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function fmt(v, digits = 2) {
    return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

const HELP = {
    buttons: {
        logs: 'Toggles the right column (logs + tree).\n\nOn: shows logs and tree view.\nOff: hides them to save space.',
        clear: 'Clears the log output (does not affect the simulation).',
        close: 'Closes the gameplay debug overlay (does not affect the simulation).'
    },
    keys: {
        title: 'Shows which keyboard inputs are currently pressed.\n\nThis is what the input layer sees before it is mapped into the physics/vehicle controller.',
        left: 'Steer left input.\n\nWhen pressed, steering input becomes negative (left).',
        right: 'Steer right input.\n\nWhen pressed, steering input becomes positive (right).',
        up: 'Throttle input.\n\nWhen pressed, throttle input rises toward 1.0.',
        down: 'Brake input.\n\nWhen pressed, brake input rises toward 1.0.',
        space: 'Handbrake input.\n\nUsed to lock the rear wheels (or increase brake force depending on tuning).',
        h: 'Headlights toggle.\n\nVisual only (no effect on physics).'
    },
    input: {
        steer: 'Raw steering input from `input:controls`.\n\nRange: [-1, 1].\nPositive = right (UI convention).\n\nUsed by RapierVehicleSim to set wheel steering angles.',
        throttle: 'Raw throttle input from `input:controls`.\n\nRange: [0, 1].\n\nUsed by the engine/powertrain sim to produce drive force. Higher throttle increases engine torque, affects clutch engagement, and can trigger upshifts.',
        brake: 'Raw brake input from `input:controls`.\n\nRange: [0, 1].\n\nUsed to compute wheel brake forces. Higher brake reduces speed and can prevent upshifts.',
        toggles: 'Input toggles from `input:controls`.\n\nHandbrake affects physics.\nHeadlights are visual only.',
        handbrake: 'Handbrake state.\n\nAdds additional braking force (often rear-biased). Higher values/active state can help rotate or stop the vehicle but will reduce acceleration.',
        headlights: 'Headlights state.\n\nVisual only (no effect on physics).'
    },
    rapierInput: {
        title: 'Latest input latched inside RapierVehicleSim (`entry.input`).\n\nIf this differs from the raw EventBus input, it usually means a mapping/sign convention or smoothing step exists between them.',
        steer: 'Latched steering value used by RapierVehicleSim.\n\nThis is the value applied to wheel steering (after any sign/scale conventions).',
        throttle: 'Latched throttle value used by RapierVehicleSim.\n\nThis is the value fed into the engine/powertrain sim each physics step.',
        brake: 'Latched brake value used by RapierVehicleSim.\n\nConverted into wheel brake force using tuning brake parameters.',
        handbrake: 'Latched handbrake value used by RapierVehicleSim.\n\nCombined with brake force to compute wheel braking.'
    },
    outputs: {
        rapierTitle: 'Physics-side outputs computed from Rapier.\n\nThese values come from the rigid-body and the vehicle controller (contacts, yaw, speed).',
        engineTitle: 'Powertrain outputs computed by EngineTransmissionSim.\n\nThese values are NOT produced by Rapier; they are used to compute the wheel drive force applied into Rapier.',
        ready: 'Vehicle controller ready state.\n\nReady means the Rapier vehicle controller exists and is updating.\nPending usually means the vehicle has not finished spawning/initializing.',
        speed: 'Vehicle speed in km/h.\n\nSource: Rapier vehicle controller forward speed.\nHigher speed increases driveline RPM for a given gear.',
        yaw: 'Chassis yaw angle (deg).\n\nSource: Rapier rigid-body rotation.\nSign conventions depend on the world axes and camera view; use this to verify steering/yaw direction.',
        driveForce: 'Drive force applied to EACH driven wheel (N).\n\nSource: EngineTransmissionSim → clutchTorque × gearRatio × finalDrive ÷ wheelRadius.\nThen clamped by `tuning.engineForce` as a safety cap.\nHigher values accelerate faster but can cause wheelspin/instability.',
        brakeForce: 'Brake force applied (N).\n\nComputed from brake + handbrake inputs and tuning brake parameters.\nHigher values slow down faster and can prevent engine-driven acceleration.',
        wheels: 'Wheel status.\n\nDot: wheel contact with ground.\nArrow: wheel steering/yaw direction.\nNeedle: wheel spin indicator.\n\nUseful to verify wheel order, contact, and steering sign.'
    },
    engineConfig: {
        wheelForceCap: 'Wheel force cap (`tuning.engineForce`).\n\nActs as a per-wheel clamp for the drive force sent into Rapier.\nIncrease if the engine sim is producing drive force but the vehicle feels artificially limited.',
        maxTorque: 'Engine max torque (N·m).\n\nUsed by the engine torque curve. Higher max torque increases available drive force across all gears.\n\nNot a Rapier value; it feeds the powertrain sim.',
        clutchMaxTorque: 'Clutch max transmitted torque (N·m).\n\nUpper limit for torque that can pass through the clutch on the engine side.\nToo low: engine revs but vehicle won’t accelerate.\nToo high: clutch locks too aggressively and RPM follows driveline.',
        finalDrive: 'Final drive ratio.\n\nMultiplies the current gear ratio to get the overall drive ratio.\nHigher final drive increases wheel torque/force but raises engine RPM for a given speed.',
        shiftRpm: 'Auto-shift RPM thresholds.\n\nUp-shift: when driveline RPM is high enough.\nDown-shift: when driveline RPM is low enough.\n\nHigher thresholds delay shifting; lower thresholds shift earlier.'
    },
    engineState: {
        gear: 'Current gear selection.\n\nAuto-shift uses driveline RPM (wheel-speed mapped into engine RPM for the current gear) and cooldown timers to decide shifts.',
        rpm: 'Engine RPM (EngineTransmissionSim).\n\nNot from Rapier.\nIf the clutch is slipping, RPM can be higher than driveline RPM.\nIf the clutch is locked, RPM should track driveline RPM closely.',
        torque: 'Engine output torque (N·m).\n\nComputed from the torque curve × throttle (before clutch).\nHigher torque increases potential drive force, but actual drive force is limited by clutch and gearing.',
        drivelineRpm: 'Driveline RPM estimate.\n\nComputed from wheel speed × (gearRatio × finalDrive).\nRepresents RPM if the clutch were fully locked.',
        slipRpm: 'RPM slip (engine RPM − driveline RPM).\n\nNear 0: clutch locked.\nPositive: engine faster (clutch slipping / accelerating).\nNegative: driveline faster (engine braking / overrun).',
        clutch: 'Clutch command / coupling.\n\nCommand (0..1): time-filtered engage/disengage.\nCoupling (0..1): effective lock factor used by the sim (includes shift blending and speed-based locking).\nHigher coupling reduces slip and makes RPM follow driveline.',
        clutchTorque: 'Clutch transmitted torque (N·m).\n\nThis is what actually reaches the gearbox.\nMultiplied by drive ratio and divided by wheel radius to become wheel drive force.',
        shift: 'Shift status.\n\nBlend: 0→1 ramp during a shift.\nTimer: remaining shift time.\nCooldown: minimum time before the next automatic shift.\n\nIf shifts feel jumpy, increase shift time; if gears skip, increase cooldown.'
    },
    tree: {
        mode: 'Selects which data is shown in the tree view.\n\nRapier: live vehicle debug from physics.\nEvent input: last `input:controls` payload.\njtree: Object3D hierarchy snapshot.\nRig: bus rig summary.',
        toggle: 'Shows/hides the tree view.\n\nOff reduces UI work and keeps the logs area smaller.',
        auto: 'Auto-refreshes the tree view at a fixed interval.\n\nTurn off to reduce overhead and use Refresh manually.',
        refresh: 'Manually refreshes the tree view now.'
    }
};

function makeBtn(label, tooltip = null) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = 'gpd-btn';
    if (tooltip) b.title = tooltip;
    return b;
}

function makeDot() {
    const el = document.createElement('div');
    el.className = 'gpd-dot';
    return el;
}

function makeSpinViz() {
    const wrap = document.createElement('div');
    wrap.className = 'gpd-spin';
    const needle = document.createElement('div');
    needle.className = 'gpd-spin-needle';
    wrap.appendChild(needle);
    return { wrap, needle };
}

function makeYawArrow() {
    const el = document.createElement('div');
    el.textContent = '▲';
    el.className = 'gpd-yaw-arrow';
    return el;
}

function radToDeg(v) {
    return (v ?? 0) * (180 / Math.PI);
}

function setDot(dot, on, { onColor = '#50ff9a', offColor = 'rgba(255, 216, 77, 0.22)' } = {}) {
    dot.classList.toggle('is-on', !!on);
}

function makeBar({ width = 120, height = 10 } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'gpd-bar';
    const fill = document.createElement('div');
    fill.className = 'gpd-bar-fill';
    wrap.appendChild(fill);
    return { wrap, fill };
}

function setBar(bar, value01) {
    const v = clamp(value01 ?? 0, 0, 1);
    bar.fill.style.width = `${(v * 100).toFixed(1)}%`;
}

function makeKeyPill(label) {
    const el = document.createElement('div');
    el.className = 'gpd-key-pill';
    el.textContent = label;
    return el;
}

function setKeyPill(pill, pressed) {
    pill.classList.toggle('is-pressed', !!pressed);
}

function makeValueRow(label, { tooltip = null } = {}) {
    const row = document.createElement('div');
    row.className = 'gpd-value-row';

    const k = document.createElement('div');
    k.className = 'gpd-value-key';
    k.textContent = label;

    const v = document.createElement('div');
    v.className = 'gpd-value-val';
    v.textContent = '—';

    row.appendChild(k);
    row.appendChild(v);
    if (tooltip) {
        row.title = tooltip;
        k.title = tooltip;
        v.title = tooltip;
    }
    return { row, k, v };
}

function makeDraggable(wrap, handle) {
    if (!wrap || !handle) return;
    handle.classList.add('gpd-draggable');

    const onPointerDown = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        wrap.style.left = `${rect.left}px`;
        wrap.style.top = `${rect.top}px`;
        wrap.style.bottom = '';
        wrap.style.right = '';
        handle.classList.add('is-dragging');

        const onPointerMove = (moveEvent) => {
            wrap.style.left = `${moveEvent.clientX - offsetX}px`;
            wrap.style.top = `${moveEvent.clientY - offsetY}px`;
        };

        const onPointerUp = () => {
            handle.classList.remove('is-dragging');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    };

    handle.addEventListener('pointerdown', onPointerDown);
}

function makeSmallLabel(text) {
    const el = document.createElement('div');
    el.className = 'gpd-small-label';
    el.textContent = text;
    return el;
}

function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

export class GameplayDebugPanel {
    constructor({ events } = {}) {
        this.events = events ?? null;
        this._expanded = true;
        this._destroyed = false;
        this._maxLogLines = 350;
        this._treeExpanded = true;
        this._treeAuto = true;
        this._treeUpdateAccum = 0;
        this._treeUpdateSec = 0.35;
        this._treeExpandState = new Map();
        this._treeMode = 'rapier';
        this._ctx = { vehicleId: null, physics: null, anchor: null, api: null, model: null };

        this.root = document.createElement('div');
        this.root.id = 'hud-gameplay-debug';
        this.root.className = 'is-expanded';

        this.header = document.createElement('div');
        this.header.className = 'gpd-header';

        const title = document.createElement('div');
        title.textContent = 'Gameplay Debug (Rapier)';
        title.className = 'gpd-title';

        const btnRow = document.createElement('div');
        btnRow.className = 'gpd-btn-row';

        this.btnToggleLogs = makeBtn('Logs', HELP.buttons.logs);
        this.btnClear = makeBtn('Clear', HELP.buttons.clear);
        this.btnClose = makeBtn('✕', HELP.buttons.close);

        btnRow.appendChild(this.btnToggleLogs);
        btnRow.appendChild(this.btnClear);
        btnRow.appendChild(this.btnClose);

        this.header.appendChild(title);
        this.header.appendChild(btnRow);
        this.root.appendChild(this.header);

        this.body = document.createElement('div');
        this.body.className = 'gpd-body';
        this.root.appendChild(this.body);

        this.left = document.createElement('div');
        this.left.className = 'gpd-left';
        this.body.appendChild(this.left);

        this.logsWrap = document.createElement('div');
        this.logsWrap.className = 'gpd-right';
        this.body.appendChild(this.logsWrap);

        this.treeWrap = document.createElement('div');
        this.treeWrap.className = 'gpd-tree-wrap';
        this.logsWrap.appendChild(this.treeWrap);

        const keysTitle = document.createElement('div');
        keysTitle.textContent = 'Keys';
        keysTitle.className = 'gpd-section-title';
        keysTitle.title = HELP.keys.title;
        this.left.appendChild(keysTitle);

        this.keysRow = document.createElement('div');
        this.keysRow.className = 'gpd-keys-row';
        this.left.appendChild(this.keysRow);

        this.keyPills = {
            left: makeKeyPill('←/A'),
            right: makeKeyPill('→/D'),
            up: makeKeyPill('↑/W'),
            down: makeKeyPill('↓/S'),
            space: makeKeyPill('Space'),
            h: makeKeyPill('H')
        };
        this.keyPills.left.title = HELP.keys.left;
        this.keyPills.right.title = HELP.keys.right;
        this.keyPills.up.title = HELP.keys.up;
        this.keyPills.down.title = HELP.keys.down;
        this.keyPills.space.title = HELP.keys.space;
        this.keyPills.h.title = HELP.keys.h;
        for (const pill of Object.values(this.keyPills)) {
            this.keysRow.appendChild(pill);
        }

        const inputTitle = document.createElement('div');
        inputTitle.textContent = 'Event Input → Rapier';
        inputTitle.className = 'gpd-section-title gpd-mt-4';
        inputTitle.title = HELP.input.steer;
        this.left.appendChild(inputTitle);

        this.inputHint = makeSmallLabel('EventBus: input:controls');
        this.left.appendChild(this.inputHint);

        this.inputGrid = document.createElement('div');
        this.inputGrid.className = 'gpd-grid';
        this.left.appendChild(this.inputGrid);

        this._input = { steering: 0, throttle: 0, brake: 0, handbrake: 0, headlights: false };
        this._rapierInput = { steering: 0, throttle: 0, brake: 0, handbrake: 0 };

        const steerRow = document.createElement('div');
        steerRow.className = 'gpd-value-row';
        steerRow.title = HELP.input.steer;
        const steerLabel = document.createElement('div');
        steerLabel.textContent = 'Steer';
        steerLabel.className = 'gpd-value-key';
        steerLabel.title = HELP.input.steer;
        const steerViz = document.createElement('div');
        steerViz.className = 'gpd-steer-viz';
        steerViz.title = HELP.input.steer;
        this.steerLeft = document.createElement('div');
        this.steerLeft.textContent = '←';
        this.steerLeft.className = 'gpd-steer-arrow';
        this.steerMid = document.createElement('div');
        this.steerMid.textContent = '•';
        this.steerMid.className = 'gpd-steer-mid';
        this.steerRight = document.createElement('div');
        this.steerRight.textContent = '→';
        this.steerRight.className = 'gpd-steer-arrow';
        this.steerVal = document.createElement('div');
        this.steerVal.className = 'gpd-value-val';
        this.steerVal.textContent = '0.00';
        steerViz.appendChild(this.steerLeft);
        steerViz.appendChild(this.steerMid);
        steerViz.appendChild(this.steerRight);
        steerViz.appendChild(this.steerVal);
        steerRow.appendChild(steerLabel);
        steerRow.appendChild(steerViz);
        this.inputGrid.appendChild(steerRow);

        const throttleRow = document.createElement('div');
        throttleRow.className = 'gpd-value-row';
        throttleRow.title = HELP.input.throttle;
        const throttleLabel = document.createElement('div');
        throttleLabel.textContent = 'Throttle';
        throttleLabel.className = 'gpd-value-key';
        throttleLabel.title = HELP.input.throttle;
        this.throttleBar = makeBar({ width: 170, height: 10 });
        this.throttleBar.wrap.title = HELP.input.throttle;
        throttleRow.appendChild(throttleLabel);
        throttleRow.appendChild(this.throttleBar.wrap);
        this.inputGrid.appendChild(throttleRow);

        const brakeRow = document.createElement('div');
        brakeRow.className = 'gpd-value-row';
        brakeRow.title = HELP.input.brake;
        const brakeLabel = document.createElement('div');
        brakeLabel.textContent = 'Brake';
        brakeLabel.className = 'gpd-value-key';
        brakeLabel.title = HELP.input.brake;
        this.brakeBar = makeBar({ width: 170, height: 10 });
        this.brakeBar.wrap.classList.add('is-brake');
        this.brakeBar.wrap.title = HELP.input.brake;
        brakeRow.appendChild(brakeLabel);
        brakeRow.appendChild(this.brakeBar.wrap);
        this.inputGrid.appendChild(brakeRow);

        const togglesRow = document.createElement('div');
        togglesRow.className = 'gpd-value-row';
        togglesRow.title = HELP.input.toggles;
        const togglesLabel = document.createElement('div');
        togglesLabel.textContent = 'Toggles';
        togglesLabel.className = 'gpd-value-key';
        togglesLabel.title = HELP.input.toggles;

        const toggles = document.createElement('div');
        toggles.className = 'gpd-toggle-row';

        const hb = document.createElement('div');
        hb.className = 'gpd-toggle';
        const hbDot = makeDot();
        hbDot.classList.add('gpd-dot--handbrake');
        const hbText = document.createElement('div');
        hbText.textContent = 'Handbrake';
        hbText.className = 'gpd-toggle-label';
        hbText.title = HELP.input.handbrake;
        hbDot.title = HELP.input.handbrake;
        hb.appendChild(hbDot);
        hb.appendChild(hbText);
        this._hbDot = hbDot;

        const hl = document.createElement('div');
        hl.className = 'gpd-toggle';
        const hlDot = makeDot();
        hlDot.classList.add('gpd-dot--headlights');
        const hlText = document.createElement('div');
        hlText.textContent = 'Headlights';
        hlText.className = 'gpd-toggle-label';
        hlText.title = HELP.input.headlights;
        hlDot.title = HELP.input.headlights;
        hl.appendChild(hlDot);
        hl.appendChild(hlText);
        this._hlDot = hlDot;

        toggles.appendChild(hb);
        toggles.appendChild(hl);
        togglesRow.appendChild(togglesLabel);
        togglesRow.appendChild(toggles);
        this.inputGrid.appendChild(togglesRow);

        const rapierInTitle = document.createElement('div');
        rapierInTitle.textContent = 'Rapier Input (latched)';
        rapierInTitle.className = 'gpd-section-title gpd-mt-4';
        rapierInTitle.title = HELP.rapierInput.title;
        this.left.appendChild(rapierInTitle);
        this.left.appendChild(makeSmallLabel('RapierVehicleSim entry.input'));

        this.rapierInputGrid = document.createElement('div');
        this.rapierInputGrid.className = 'gpd-grid gpd-grid--two';
        this.left.appendChild(this.rapierInputGrid);

        this.rapierInSteer = makeValueRow('Steer', { tooltip: HELP.rapierInput.steer });
        this.rapierInputGrid.appendChild(this.rapierInSteer.row);
        this.rapierInThrottle = makeValueRow('Throttle', { tooltip: HELP.rapierInput.throttle });
        this.rapierInputGrid.appendChild(this.rapierInThrottle.row);
        this.rapierInBrake = makeValueRow('Brake', { tooltip: HELP.rapierInput.brake });
        this.rapierInputGrid.appendChild(this.rapierInBrake.row);
        this.rapierInHB = makeValueRow('Handbrake', { tooltip: HELP.rapierInput.handbrake });
        this.rapierInputGrid.appendChild(this.rapierInHB.row);

        const outTitle = document.createElement('div');
        outTitle.textContent = 'Outputs';
        outTitle.className = 'gpd-section-title gpd-mt-4';
        this.left.appendChild(outTitle);

        const rapierOutTitle = document.createElement('div');
        rapierOutTitle.textContent = 'Rapier Output';
        rapierOutTitle.className = 'gpd-section-title is-muted';
        rapierOutTitle.title = HELP.outputs.rapierTitle;
        this.left.appendChild(rapierOutTitle);

        this.rapierOutGrid = document.createElement('div');
        this.rapierOutGrid.className = 'gpd-grid';
        this.left.appendChild(this.rapierOutGrid);

        const readyRow = document.createElement('div');
        readyRow.className = 'gpd-value-row';
        readyRow.title = HELP.outputs.ready;
        const readyLabel = document.createElement('div');
        readyLabel.textContent = 'Vehicle';
        readyLabel.className = 'gpd-value-key';
        readyLabel.title = HELP.outputs.ready;
        const readyR = document.createElement('div');
        readyR.className = 'gpd-row-right';
        readyR.title = HELP.outputs.ready;
        this.readyDot = makeDot();
        this.readyDot.title = HELP.outputs.ready;
        this.readyText = document.createElement('div');
        this.readyText.textContent = '—';
        this.readyText.className = 'gpd-value-val';
        this.readyText.title = HELP.outputs.ready;
        readyR.appendChild(this.readyDot);
        readyR.appendChild(this.readyText);
        readyRow.appendChild(readyLabel);
        readyRow.appendChild(readyR);
        this.rapierOutGrid.appendChild(readyRow);

        this.speedRow = makeValueRow('Speed (km/h)', { tooltip: HELP.outputs.speed });
        this.rapierOutGrid.appendChild(this.speedRow.row);
        this.yawRow = makeValueRow('Yaw (deg)', { tooltip: HELP.outputs.yaw });
        this.rapierOutGrid.appendChild(this.yawRow.row);
        this.driveRow = makeValueRow('DriveF (N)', { tooltip: HELP.outputs.driveForce });
        this.rapierOutGrid.appendChild(this.driveRow.row);
        this.brakeForceRow = makeValueRow('BrakeF (N)', { tooltip: HELP.outputs.brakeForce });
        this.rapierOutGrid.appendChild(this.brakeForceRow.row);

        const wheelsRow = document.createElement('div');
        wheelsRow.className = 'gpd-value-row gpd-wheels-row';
        wheelsRow.title = HELP.outputs.wheels;
        const wheelsLabel = document.createElement('div');
        wheelsLabel.textContent = 'Wheels';
        wheelsLabel.className = 'gpd-value-key gpd-pad-top-4';
        wheelsLabel.title = HELP.outputs.wheels;

        this.wheelsDots = document.createElement('div');
        this.wheelsDots.className = 'gpd-wheels-dots';
        this.wheelsDots.title = HELP.outputs.wheels;
        this._wheelCells = [];
        this._wheelSig = '';

        wheelsRow.appendChild(wheelsLabel);
        wheelsRow.appendChild(this.wheelsDots);
        this.rapierOutGrid.appendChild(wheelsRow);

        const engineOutTitle = document.createElement('div');
        engineOutTitle.textContent = 'Engine / Transmission';
        engineOutTitle.className = 'gpd-section-title is-muted gpd-mt-6';
        engineOutTitle.title = HELP.outputs.engineTitle;
        this.left.appendChild(engineOutTitle);

        this.engineOutGrid = document.createElement('div');
        this.engineOutGrid.className = 'gpd-grid';
        this.left.appendChild(this.engineOutGrid);

        const cfgLabel = makeSmallLabel('Config');
        cfgLabel.title = HELP.outputs.engineTitle;
        this.engineOutGrid.appendChild(cfgLabel);

        this.engineForceCapRow = makeValueRow('WheelForceCap (N)', { tooltip: HELP.engineConfig.wheelForceCap });
        this.engineOutGrid.appendChild(this.engineForceCapRow.row);
        this.maxTorqueCfgRow = makeValueRow('MaxTorque (N*m)', { tooltip: HELP.engineConfig.maxTorque });
        this.engineOutGrid.appendChild(this.maxTorqueCfgRow.row);
        this.clutchMaxTorqueCfgRow = makeValueRow('ClutchMaxTq (N*m)', { tooltip: HELP.engineConfig.clutchMaxTorque });
        this.engineOutGrid.appendChild(this.clutchMaxTorqueCfgRow.row);
        this.finalDriveCfgRow = makeValueRow('FinalDrive', { tooltip: HELP.engineConfig.finalDrive });
        this.engineOutGrid.appendChild(this.finalDriveCfgRow.row);
        this.shiftRpmCfgRow = makeValueRow('ShiftRPM (down/up)', { tooltip: HELP.engineConfig.shiftRpm });
        this.engineOutGrid.appendChild(this.shiftRpmCfgRow.row);

        const stateLabel = makeSmallLabel('State');
        stateLabel.title = HELP.outputs.engineTitle;
        this.engineOutGrid.appendChild(stateLabel);

        this.gearRow = makeValueRow('Gear', { tooltip: HELP.engineState.gear });
        this.engineOutGrid.appendChild(this.gearRow.row);
        this.rpmRow = makeValueRow('RPM', { tooltip: HELP.engineState.rpm });
        this.engineOutGrid.appendChild(this.rpmRow.row);
        this.engineTorqueRow = makeValueRow('EngTorque (N*m)', { tooltip: HELP.engineState.torque });
        this.engineOutGrid.appendChild(this.engineTorqueRow.row);
        this.drivelineRpmRow = makeValueRow('DrivelineRPM', { tooltip: HELP.engineState.drivelineRpm });
        this.engineOutGrid.appendChild(this.drivelineRpmRow.row);
        this.slipRpmRow = makeValueRow('SlipRPM', { tooltip: HELP.engineState.slipRpm });
        this.engineOutGrid.appendChild(this.slipRpmRow.row);
        this.clutchRow = makeValueRow('Clutch (cmd/cpl)', { tooltip: HELP.engineState.clutch });
        this.engineOutGrid.appendChild(this.clutchRow.row);
        this.clutchTorqueRow = makeValueRow('ClutchTq (N*m)', { tooltip: HELP.engineState.clutchTorque });
        this.engineOutGrid.appendChild(this.clutchTorqueRow.row);
        this.shiftRow = makeValueRow('Shift', { tooltip: HELP.engineState.shift });
        this.engineOutGrid.appendChild(this.shiftRow.row);

        const logsTitleRow = document.createElement('div');
        logsTitleRow.className = 'gpd-logs-title-row';
        const logsTitle = document.createElement('div');
        logsTitle.textContent = 'Logs';
        logsTitle.className = 'gpd-logs-title';
        this.logsHint = document.createElement('div');
        this.logsHint.className = 'gpd-logs-hint';
        this.logsHint.textContent = '';
        logsTitleRow.appendChild(logsTitle);
        logsTitleRow.appendChild(this.logsHint);
        this.logsWrap.appendChild(logsTitleRow);

        this.logs = document.createElement('div');
        this.logs.className = 'gpd-logs';
        this.logsWrap.appendChild(this.logs);

        makeDraggable(this.root, this.header);

        this.btnToggleLogs.addEventListener('click', () => {
            this.setExpanded(!this._expanded);
        });
        this.btnClear.addEventListener('click', () => {
            this.logs.innerHTML = '';
        });
        this.btnClose.addEventListener('click', () => {
            this.destroy();
        });

        this._unsubInput = this.events?.on?.('input:controls', (e) => {
            this.setInput(e);
        }) ?? null;

        this._buildTreeHeader();
        this.setExpanded(true);
        this.log('debug panel ready');
    }

    attach(parent = document.body) {
        if (this._destroyed) return;
        if (!this.root.isConnected) parent.appendChild(this.root);
        this._scheduleMinHeightRefresh();
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._unsubInput?.();
        this._unsubInput = null;
        if (this.root.isConnected) this.root.remove();
    }

    setContext({ vehicleId, physics, anchor, api, model } = {}) {
        this._ctx.vehicleId = vehicleId ?? this._ctx.vehicleId;
        this._ctx.physics = physics ?? this._ctx.physics;
        this._ctx.anchor = anchor ?? this._ctx.anchor;
        this._ctx.api = api ?? this._ctx.api;
        this._ctx.model = model ?? this._ctx.model;
    }

    setExpanded(expanded) {
        this._expanded = !!expanded;
        this.root.classList.toggle('is-expanded', this._expanded);
        this.btnToggleLogs.textContent = this._expanded ? 'Logs: On' : 'Logs: Off';
        this._scheduleMinHeightRefresh();
    }

    log(message) {
        if (this._destroyed) return;
        const line = document.createElement('div');
        line.className = 'gpd-log-line';
        const ts = new Date();
        const hh = String(ts.getHours()).padStart(2, '0');
        const mm = String(ts.getMinutes()).padStart(2, '0');
        const ss = String(ts.getSeconds()).padStart(2, '0');
        line.textContent = `[${hh}:${mm}:${ss}] ${String(message ?? '')}`;
        this.logs.appendChild(line);

        while (this.logs.childNodes.length > this._maxLogLines) {
            this.logs.removeChild(this.logs.firstChild);
        }
        this.logs.scrollTop = this.logs.scrollHeight;
    }

    setKeys(keys) {
        if (this._destroyed) return;
        const k = keys ?? {};
        setKeyPill(this.keyPills.left, !!k.left);
        setKeyPill(this.keyPills.right, !!k.right);
        setKeyPill(this.keyPills.up, !!k.up);
        setKeyPill(this.keyPills.down, !!k.down);
        setKeyPill(this.keyPills.space, !!k.space);
        setKeyPill(this.keyPills.h, !!k.h);
    }

    setInput(input) {
        if (this._destroyed) return;
        if (!input) return;
        this._input.steering = Number.isFinite(input.steering) ? input.steering : this._input.steering;
        this._input.throttle = Number.isFinite(input.throttle) ? input.throttle : this._input.throttle;
        this._input.brake = Number.isFinite(input.brake) ? input.brake : this._input.brake;
        this._input.handbrake = Number.isFinite(input.handbrake) ? input.handbrake : this._input.handbrake;
        this._input.headlights = !!input.headlights;

        const s = clamp(this._input.steering, -1, 1);
        this.steerVal.textContent = fmt(s, 2);
        this.steerLeft.classList.toggle('is-active', s < -0.02);
        this.steerRight.classList.toggle('is-active', s > 0.02);

        setBar(this.throttleBar, clamp(this._input.throttle, 0, 1));
        setBar(this.brakeBar, clamp(this._input.brake, 0, 1));
        setDot(this._hbDot, (this._input.handbrake ?? 0) > 0.5);
        setDot(this._hlDot, !!this._input.headlights);
    }

    setRapierDebug(debug) {
        if (this._destroyed) return;
        if (!debug) {
            setDot(this.readyDot, false);
            this.readyText.textContent = '—';
            this.speedRow.v.textContent = '—';
            this.yawRow.v.textContent = '—';
            this.driveRow.v.textContent = '—';
            this.brakeForceRow.v.textContent = '—';
            this.engineForceCapRow.v.textContent = '—';
            this.maxTorqueCfgRow.v.textContent = '—';
            this.clutchMaxTorqueCfgRow.v.textContent = '—';
            this.finalDriveCfgRow.v.textContent = '—';
            this.shiftRpmCfgRow.v.textContent = '—';
            this.gearRow.v.textContent = '—';
            this.rpmRow.v.textContent = '—';
            this.engineTorqueRow.v.textContent = '—';
            this.drivelineRpmRow.v.textContent = '—';
            this.slipRpmRow.v.textContent = '—';
            this.clutchRow.v.textContent = '—';
            this.clutchTorqueRow.v.textContent = '—';
            this.shiftRow.v.textContent = '—';
            this._lastSpinDeg = 0;
            this._syncWheelCells([]);
            return;
        }

        const rapierIn = debug.input ?? {};
        this._rapierInput.steering = Number.isFinite(rapierIn.steering) ? rapierIn.steering : 0;
        this._rapierInput.throttle = Number.isFinite(rapierIn.throttle) ? rapierIn.throttle : 0;
        this._rapierInput.brake = Number.isFinite(rapierIn.brake) ? rapierIn.brake : 0;
        this._rapierInput.handbrake = Number.isFinite(rapierIn.handbrake) ? rapierIn.handbrake : 0;
        this.rapierInSteer.v.textContent = fmt(this._rapierInput.steering, 2);
        this.rapierInThrottle.v.textContent = fmt(this._rapierInput.throttle, 2);
        this.rapierInBrake.v.textContent = fmt(this._rapierInput.brake, 2);
        this.rapierInHB.v.textContent = fmt(this._rapierInput.handbrake, 2);

        setDot(this.readyDot, !!debug.ready);
        this.readyText.textContent = debug.ready ? 'ready' : 'pending';

        const speedKph = debug.locomotion?.speedKph ?? 0;
        const yawDeg = (debug.locomotion?.yaw ?? 0) * (180 / Math.PI);
        const gearLabel = debug.drivetrain?.gearLabel ?? (debug.drivetrain?.gear ?? null);
        const rpm = debug.drivetrain?.rpm ?? 0;
        const engineTorque = debug.drivetrain?.torque ?? null;
        const drivelineRpm = debug.drivetrain?.drivelineRpm ?? null;
        const clutchTorque = debug.drivetrain?.clutchTorque ?? null;
        const clutch = debug.drivetrain?.clutch ?? null;
        const coupling = debug.drivetrain?.coupling ?? null;
        const slipOmega = debug.drivetrain?.slipOmega ?? null;
        const slipRpm = Number.isFinite(slipOmega) ? (slipOmega * 60 / (Math.PI * 2)) : null;
        const shiftBlend = debug.drivetrain?.shiftBlend ?? null;
        const shiftTimer = debug.drivetrain?.shiftTimer ?? null;
        const shiftCooldown = debug.drivetrain?.shiftCooldown ?? null;
        const driveF = debug.forces?.driveForce ?? 0;
        const brakeF = debug.forces?.brakeForce ?? 0;

        this.speedRow.v.textContent = fmt(speedKph, 1);
        this.yawRow.v.textContent = fmt(yawDeg, 1);
        const engineCfg = debug.engineSimConfig ?? null;
        const shiftDownRpm = engineCfg?.shiftDownRpm ?? null;
        const shiftUpRpm = engineCfg?.shiftUpRpm ?? null;
        this.engineForceCapRow.v.textContent = fmt(engineCfg?.wheelForceCap, 0);
        this.maxTorqueCfgRow.v.textContent = fmt(engineCfg?.maxTorque, 0);
        this.clutchMaxTorqueCfgRow.v.textContent = fmt(engineCfg?.clutchMaxTorque, 0);
        this.finalDriveCfgRow.v.textContent = fmt(engineCfg?.finalDrive, 2);
        this.shiftRpmCfgRow.v.textContent = `${fmt(shiftDownRpm, 0)} / ${fmt(shiftUpRpm, 0)}`;
        this.gearRow.v.textContent = gearLabel != null ? String(gearLabel) : '—';
        this.rpmRow.v.textContent = fmt(rpm, 0);
        this.engineTorqueRow.v.textContent = fmt(engineTorque, 0);
        this.drivelineRpmRow.v.textContent = fmt(drivelineRpm, 0);
        this.slipRpmRow.v.textContent = fmt(slipRpm, 0);
        this.clutchRow.v.textContent = `${fmt(clutch, 2)} / ${fmt(coupling, 2)}`;
        this.clutchTorqueRow.v.textContent = fmt(clutchTorque, 0);
        this.shiftRow.v.textContent = `${fmt(shiftBlend, 2)} t:${fmt(shiftTimer, 2)} cd:${fmt(shiftCooldown, 2)}`;
        this.driveRow.v.textContent = fmt(driveF, 0);
        this.brakeForceRow.v.textContent = fmt(brakeF, 0);

        const wheels = Array.isArray(debug.wheels) ? debug.wheels : [];
        this._lastSpinDeg = radToDeg(debug.locomotion?.wheelSpinAccum ?? 0);
        this._syncWheelCells(wheels);

        if (this._treeAuto) {
            this._treeUpdateAccum += this._treeUpdateSec;
            this._refreshTree({ force: false });
        }
    }

    _syncWheelCells(wheels) {
        const list = Array.isArray(wheels) ? wheels : [];

        const wheelInfos = list.map((wheel, i) => {
            const label = String(wheel?.labelEx ?? wheel?.label ?? '');
            const derived = label || (Number.isFinite(wheel?.index) ? `W${wheel.index}` : `W${i}`);
            const x = wheel?.connection?.x ?? wheel?.center?.x ?? null;
            const z = wheel?.connection?.z ?? wheel?.center?.z ?? null;
            return {
                wheel,
                i,
                id: Number.isFinite(wheel?.index) ? wheel.index : i,
                label: derived,
                x: Number.isFinite(x) ? x : null,
                z: Number.isFinite(z) ? z : null
            };
        });

        const clusterAxles = (items) => {
            const withZ = items.filter((it) => Number.isFinite(it.z));
            if (!withZ.length) return [{ zRef: 0, items: [...items] }];
            const sorted = [...withZ].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
            const values = sorted.map((s) => s.z ?? 0);
            const spread = Math.abs(values[0] - values[values.length - 1]);
            const threshold = Math.max(0.25, spread * 0.12);

            const groups = [];
            for (const it of sorted) {
                const z = it.z ?? 0;
                const last = groups[groups.length - 1] ?? null;
                if (!last || Math.abs(z - last.zRef) > threshold) {
                    groups.push({ zRef: z, items: [it] });
                } else {
                    last.items.push(it);
                    last.zRef = (last.zRef * (last.items.length - 1) + z) / last.items.length;
                }
            }

            const used = new Set(sorted.map((s) => s.i));
            for (const it of items) {
                if (!used.has(it.i)) groups[groups.length - 1].items.push(it);
            }
            return groups;
        };

        const axleGroups = clusterAxles(wheelInfos);
        const orderedGroups = axleGroups.map((g, gi) => {
            const wheelsInAxle = [...g.items];
            wheelsInAxle.sort((a, b) => {
                const ax = a.x ?? 0;
                const bx = b.x ?? 0;
                return ax - bx;
            });
            const left = wheelsInAxle.find((w) => (w.x ?? 0) < 0) ?? wheelsInAxle[0] ?? null;
            const right = [...wheelsInAxle].reverse().find((w) => (w.x ?? 0) > 0) ?? wheelsInAxle[wheelsInAxle.length - 1] ?? null;
            const leftItem = left ?? null;
            const rightItem = right && right.i !== leftItem?.i ? right : null;
            const fallback = wheelsInAxle.find((w) => w.i !== leftItem?.i) ?? null;
            return {
                id: `ax${gi}`,
                zRef: g.zRef,
                left: leftItem,
                right: rightItem ?? fallback
            };
        });

        const sig = orderedGroups
            .map((g) => `${g.id}:${g.left?.id ?? '—'},${g.right?.id ?? '—'}`)
            .join('|');
        if (sig !== this._wheelSig) {
            this._wheelSig = sig;
            this.wheelsDots.innerHTML = '';
            this._wheelCells.length = 0;
            const makeWheelCell = (labelText) => {
                const cell = document.createElement('div');
                cell.className = 'gpd-wheel-cell';
                if (labelText) cell.title = labelText;

                const dot = makeDot();
                dot.classList.add('gpd-dot--contact');

                const yaw = makeYawArrow();
                const spin = makeSpinViz();

                cell.appendChild(dot);
                cell.appendChild(yaw);
                cell.appendChild(spin.wrap);

                return { cell, dot, yaw, spinNeedle: spin.needle };
            };

            for (const g of orderedGroups) {
                const row = document.createElement('div');
                row.className = 'gpd-wheel-row';

                const left = makeWheelCell(g.left?.label ?? '');
                const right = makeWheelCell(g.right?.label ?? '');

                row.appendChild(left.cell);
                row.appendChild(right.cell);
                this.wheelsDots.appendChild(row);

                this._wheelCells.push({ ...left, wheelId: g.left?.id ?? null, row });
                this._wheelCells.push({ ...right, wheelId: g.right?.id ?? null, row });
            }
            this._scheduleMinHeightRefresh();
        }

        const wheelById = new Map();
        for (let i = 0; i < wheelInfos.length; i++) {
            wheelById.set(wheelInfos[i].id, wheelInfos[i].wheel);
        }

        for (let i = 0; i < this._wheelCells.length; i++) {
            const cell = this._wheelCells[i];
            const w = cell.wheelId != null ? (wheelById.get(cell.wheelId) ?? null) : null;
            const inContact = w ? !!w.inContact : false;
            setDot(cell.dot, inContact);
            cell.cell.classList.toggle('is-missing', !w);
            cell.cell.classList.toggle('is-airborne', !!w && !inContact);
            cell.cell.classList.toggle('is-contact', !!w && inContact);

            const steerRad = (w && Number.isFinite(w.steering)) ? w.steering : 0;
            const steerDeg = -radToDeg(steerRad);
            if (cell.yaw) {
                cell.yaw.style.transform = `rotate(${steerDeg.toFixed(1)}deg)`;
            }
            if (cell.spinNeedle) {
                cell.spinNeedle.style.transform = `translate(0, -50%) rotate(${(this._lastSpinDeg ?? 0).toFixed(1)}deg)`;
            }
        }
    }

    _buildTreeHeader() {
        this.treeHeader = document.createElement('div');
        this.treeHeader.className = 'gpd-tree-header';

        const left = document.createElement('div');
        left.className = 'gpd-tree-header-left';

        this.treeModeSel = document.createElement('select');
        this.treeModeSel.className = 'gpd-select';
        this.treeModeSel.title = HELP.tree.mode;
        for (const opt of [
            { value: 'rapier', label: 'Rapier' },
            { value: 'event', label: 'Event input' },
            { value: 'scene', label: 'jtree' },
            { value: 'rig', label: 'Rig' }
        ]) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            this.treeModeSel.appendChild(o);
        }
        this.treeModeSel.value = this._treeMode === 'skeleton' ? 'rig' : this._treeMode;
        this.treeModeSel.addEventListener('change', () => {
            this._treeMode = this.treeModeSel.value;
            this._refreshTree({ force: true });
        });
        left.appendChild(this.treeModeSel);

        const right = document.createElement('div');
        right.className = 'gpd-tree-header-right';

        this.btnTreeToggle = makeBtn('Tree: On', HELP.tree.toggle);
        this.btnTreeToggle.addEventListener('click', () => {
            this._treeExpanded = !this._treeExpanded;
            this.btnTreeToggle.textContent = this._treeExpanded ? 'Tree: On' : 'Tree: Off';
            this.treeBody.classList.toggle('hidden', !this._treeExpanded);
            this._scheduleMinHeightRefresh();
        });

        this.btnTreeAuto = makeBtn('Auto: On', HELP.tree.auto);
        this.btnTreeAuto.addEventListener('click', () => {
            this._treeAuto = !this._treeAuto;
            this.btnTreeAuto.textContent = this._treeAuto ? 'Auto: On' : 'Auto: Off';
        });

        this.btnTreeRefresh = makeBtn('Refresh', HELP.tree.refresh);
        this.btnTreeRefresh.addEventListener('click', () => {
            this._refreshTree({ force: true });
        });

        right.appendChild(this.btnTreeToggle);
        right.appendChild(this.btnTreeAuto);
        right.appendChild(this.btnTreeRefresh);

        this.treeHeader.appendChild(left);
        this.treeHeader.appendChild(right);
        this.treeWrap.appendChild(this.treeHeader);

        this.treeBody = document.createElement('div');
        this.treeBody.className = 'gpd-tree-body';
        this.treeBody.classList.toggle('hidden', !this._treeExpanded);
        this.treeWrap.appendChild(this.treeBody);

        this._refreshTree({ force: true });
    }

    _refreshTree({ force = false } = {}) {
        if (this._destroyed) return;
        if (!this._treeExpanded) return;
        if (!force) {
            const now = performance?.now ? performance.now() * 0.001 : 0;
            if (!this._treeLastSec) this._treeLastSec = now;
            const dt = now - this._treeLastSec;
            if (dt < this._treeUpdateSec) return;
            this._treeLastSec = now;
        }

        let data = null;
        let title = '';
        if (this._treeMode === 'event') {
            title = 'input:controls (latest)';
            data = { ...this._input };
        } else if (this._treeMode === 'rapier') {
            title = 'getVehicleDebug() (latest)';
            const vid = this._ctx.vehicleId;
            data = (vid && this._ctx.physics?.getVehicleDebug) ? this._ctx.physics.getVehicleDebug(vid) : null;
        } else if (this._treeMode === 'scene') {
            title = 'anchor/model tree';
            const root = this._ctx.anchor ?? this._ctx.model ?? null;
            data = root ? this._packObject3DTree(root, 3) : null;
        } else if (this._treeMode === 'rig' || this._treeMode === 'skeleton') {
            title = 'bus rig';
            data = this._packRig(this._ctx.api);
        }

        this.treeBody.innerHTML = '';
        const hint = document.createElement('div');
        hint.textContent = title;
        hint.className = 'gpd-tree-hint';
        this.treeBody.appendChild(hint);

        if (data == null) {
            const empty = document.createElement('div');
            empty.textContent = '—';
            empty.className = 'gpd-tree-empty';
            this.treeBody.appendChild(empty);
            return;
        }

        this.treeBody.appendChild(this._renderTreeNode('$', data, '$', 0));
    }

    _renderTreeNode(key, value, path, depth) {
        const row = document.createElement('div');
        row.className = 'gpd-tree-node';
        row.style.paddingLeft = `${depth * 12}px`;

        const isObj = isPlainObject(value);
        const isArr = Array.isArray(value);
        const isExpandable = isObj || isArr;
        const isOpen = this._treeExpandState.get(path) ?? (depth < 1);

        const head = document.createElement('div');
        head.className = 'gpd-tree-head';
        head.classList.toggle('is-expandable', isExpandable);

        const caret = document.createElement('div');
        caret.textContent = isExpandable ? (isOpen ? '▾' : '▸') : ' ';
        caret.className = 'gpd-tree-caret';

        const k = document.createElement('div');
        k.textContent = String(key);
        k.className = 'gpd-tree-key';

        const v = document.createElement('div');
        v.className = 'gpd-tree-value';

        const summarize = (val) => {
            if (val == null) return 'null';
            if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NaN';
            if (typeof val === 'boolean') return val ? 'true' : 'false';
            if (typeof val === 'string') return JSON.stringify(val);
            if (Array.isArray(val)) return `Array(${val.length})`;
            if (isPlainObject(val)) return `Object(${Object.keys(val).length})`;
            return String(val);
        };

        v.textContent = isExpandable ? summarize(value) : summarize(value);

        head.appendChild(caret);
        head.appendChild(k);
        head.appendChild(v);
        row.appendChild(head);

        if (isExpandable) {
            head.addEventListener('click', (e) => {
                e.preventDefault();
                const next = !(this._treeExpandState.get(path) ?? (depth < 1));
                this._treeExpandState.set(path, next);
                this._refreshTree({ force: true });
            });
        }

        if (isExpandable && isOpen) {
            const body = document.createElement('div');
            if (isArr) {
                for (let i = 0; i < value.length; i++) {
                    const childPath = `${path}[${i}]`;
                    body.appendChild(this._renderTreeNode(i, value[i], childPath, depth + 1));
                }
            } else {
                const keys = Object.keys(value);
                for (const kk of keys) {
                    const childPath = `${path}.${kk}`;
                    body.appendChild(this._renderTreeNode(kk, value[kk], childPath, depth + 1));
                }
            }
            row.appendChild(body);
        }

        return row;
    }

    _packObject3DTree(obj, maxDepth = 3, depth = 0) {
        if (!obj || depth > maxDepth) return null;
        const out = {
            name: obj.name ?? '',
            type: obj.type ?? '',
            visible: obj.visible ?? true,
            position: obj.position ? { x: q(obj.position.x), y: q(obj.position.y), z: q(obj.position.z) } : null,
            rotation: obj.rotation ? { x: q(obj.rotation.x), y: q(obj.rotation.y), z: q(obj.rotation.z) } : null,
            children: []
        };
        if (Array.isArray(obj.children) && depth < maxDepth) {
            for (const c of obj.children) {
                out.children.push(this._packObject3DTree(c, maxDepth, depth + 1));
            }
        }
        return out;
    }

    _packRig(api) {
        if (!api) return null;
        const pick = (o) => o?.isObject3D ? (o.name || o.type || 'Object3D') : null;
        return {
            root: pick(api.root),
            yawPivot: pick(api.yawPivot),
            vehicleTiltPivot: pick(api.vehicleTiltPivot),
            wheelsRoot: pick(api.wheelsRoot),
            bodyTiltPivot: pick(api.bodyTiltPivot),
            bodyRoot: pick(api.bodyRoot),
            tiltPivot: pick(api.tiltPivot),
            wheelRig: api.wheelRig ? { front: api.wheelRig.front?.length ?? 0, rear: api.wheelRig.rear?.length ?? 0, wheelRadius: api.wheelRig.wheelRadius ?? null } : null
        };
    }

    _scheduleMinHeightRefresh() {
        if (this._destroyed) return;
        if (typeof requestAnimationFrame !== 'function') {
            this._refreshMinHeight();
            return;
        }
        requestAnimationFrame(() => this._refreshMinHeight());
    }

    _refreshMinHeight() {
        if (this._destroyed || !this.root.isConnected) return;
        const headerH = this.header.getBoundingClientRect().height || 0;
        const leftH = this.left.scrollHeight || 0;
        const pad = 6;
        const minH = Math.max(0, Math.ceil(headerH + leftH + pad));
        this.root.style.minHeight = `${minH}px`;
    }
}

function q(v) {
    return Number.isFinite(v) ? Number(v.toFixed(3)) : null;
}
