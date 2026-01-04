// src/graphics/gui/gameplay/GameplayDebugPanel.js
// Lightweight gameplay debug overlay (DOM only).

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function fmt(v, digits = 2) {
    return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

function makeBtn(label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.border = '1px solid rgba(255, 220, 110, 0.30)';
    b.style.background = 'rgba(0,0,0,0.22)';
    b.style.color = '#ffd84d';
    b.style.fontSize = '12px';
    b.style.fontWeight = '800';
    b.style.padding = '6px 10px';
    b.style.borderRadius = '10px';
    b.style.cursor = 'pointer';
    b.style.pointerEvents = 'auto';
    b.addEventListener('mouseenter', () => { b.style.background = 'rgba(0,0,0,0.32)'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'rgba(0,0,0,0.22)'; });
    return b;
}

function makeDot() {
    const el = document.createElement('div');
    el.style.width = '10px';
    el.style.height = '10px';
    el.style.borderRadius = '999px';
    el.style.background = 'rgba(255, 216, 77, 0.22)';
    el.style.border = '1px solid rgba(255, 216, 77, 0.35)';
    return el;
}

function makeSpinViz() {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.width = '14px';
    wrap.style.height = '14px';
    wrap.style.borderRadius = '999px';
    wrap.style.border = '1px solid rgba(255, 216, 77, 0.30)';
    wrap.style.background = 'rgba(0,0,0,0.18)';
    wrap.style.flex = '0 0 auto';
    const needle = document.createElement('div');
    needle.style.position = 'absolute';
    needle.style.left = '50%';
    needle.style.top = '50%';
    needle.style.width = '10px';
    needle.style.height = '2px';
    needle.style.background = 'rgba(255, 216, 77, 0.85)';
    needle.style.borderRadius = '999px';
    needle.style.transformOrigin = '0% 50%';
    needle.style.transform = 'translate(0, -50%) rotate(0deg)';
    wrap.appendChild(needle);
    return { wrap, needle };
}

function makeYawArrow() {
    const el = document.createElement('div');
    el.textContent = '▲';
    el.style.width = '14px';
    el.style.height = '14px';
    el.style.display = 'grid';
    el.style.placeItems = 'center';
    el.style.fontSize = '11px';
    el.style.fontWeight = '950';
    el.style.opacity = '0.9';
    el.style.transformOrigin = '50% 50%';
    return el;
}

function radToDeg(v) {
    return (v ?? 0) * (180 / Math.PI);
}

function setDot(dot, on, { onColor = '#50ff9a', offColor = 'rgba(255, 216, 77, 0.22)' } = {}) {
    dot.style.background = on ? onColor : offColor;
    dot.style.borderColor = on ? 'rgba(80, 255, 154, 0.55)' : 'rgba(255, 216, 77, 0.35)';
}

function makeBar({ width = 120, height = 10 } = {}) {
    const wrap = document.createElement('div');
    wrap.style.width = `${width}px`;
    wrap.style.height = `${height}px`;
    wrap.style.borderRadius = '999px';
    wrap.style.background = 'rgba(255, 216, 77, 0.12)';
    wrap.style.border = '1px solid rgba(255, 216, 77, 0.22)';
    wrap.style.overflow = 'hidden';
    const fill = document.createElement('div');
    fill.style.height = '100%';
    fill.style.width = '0%';
    fill.style.background = 'rgba(255, 216, 77, 0.78)';
    fill.style.borderRadius = '999px';
    wrap.appendChild(fill);
    return { wrap, fill };
}

function setBar(bar, value01) {
    const v = clamp(value01 ?? 0, 0, 1);
    bar.fill.style.width = `${(v * 100).toFixed(1)}%`;
}

function makeKeyPill(label) {
    const el = document.createElement('div');
    el.textContent = label;
    el.style.padding = '4px 8px';
    el.style.borderRadius = '10px';
    el.style.border = '1px solid rgba(255, 216, 77, 0.22)';
    el.style.background = 'rgba(0,0,0,0.25)';
    el.style.fontSize = '12px';
    el.style.fontWeight = '900';
    el.style.letterSpacing = '0.2px';
    el.style.opacity = '0.75';
    el.style.userSelect = 'none';
    return el;
}

function setKeyPill(pill, pressed) {
    pill.style.opacity = pressed ? '1' : '0.55';
    pill.style.background = pressed ? 'rgba(255, 216, 77, 0.20)' : 'rgba(0,0,0,0.25)';
    pill.style.borderColor = pressed ? 'rgba(255, 216, 77, 0.55)' : 'rgba(255, 216, 77, 0.22)';
}

function makeValueRow(label) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';

    const k = document.createElement('div');
    k.textContent = label;
    k.style.fontSize = '12px';
    k.style.fontWeight = '900';
    k.style.opacity = '0.85';

    const v = document.createElement('div');
    v.textContent = '—';
    v.style.fontSize = '12px';
    v.style.fontWeight = '900';
    v.style.opacity = '0.95';

    row.appendChild(k);
    row.appendChild(v);
    return { row, v };
}

function makeDraggable(wrap, handle) {
    if (!wrap || !handle) return;
    handle.style.cursor = 'grab';
    handle.style.userSelect = 'none';
    handle.style.touchAction = 'none';

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
        handle.style.cursor = 'grabbing';

        const onPointerMove = (moveEvent) => {
            wrap.style.left = `${moveEvent.clientX - offsetX}px`;
            wrap.style.top = `${moveEvent.clientY - offsetY}px`;
        };

        const onPointerUp = () => {
            handle.style.cursor = 'grab';
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
    el.textContent = text;
    el.style.fontSize = '11px';
    el.style.fontWeight = '900';
    el.style.opacity = '0.72';
    el.style.letterSpacing = '0.2px';
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
        this.root.style.position = 'fixed';
        this.root.style.left = '16px';
        this.root.style.top = '84px';
        this.root.style.zIndex = '120';
        this.root.style.pointerEvents = 'auto';
        this.root.style.userSelect = 'none';
        this.root.style.color = '#ffd84d';
        this.root.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        this.root.style.background = 'rgba(0,0,0,0.68)';
        this.root.style.border = '1px solid rgba(255, 216, 77, 0.25)';
        this.root.style.backdropFilter = 'blur(6px)';
        this.root.style.borderRadius = '14px';
        this.root.style.boxShadow = '0 14px 40px rgba(0,0,0,0.45)';
        this.root.style.minWidth = '680px';
        this.root.style.width = '760px';
        this.root.style.height = '360px';
        this.root.style.resize = 'both';
        this.root.style.overflow = 'hidden';

        this.header = document.createElement('div');
        this.header.style.display = 'flex';
        this.header.style.alignItems = 'center';
        this.header.style.justifyContent = 'space-between';
        this.header.style.gap = '10px';
        this.header.style.padding = '10px 12px';
        this.header.style.borderBottom = '1px solid rgba(255, 216, 77, 0.18)';
        this.header.style.background = 'rgba(0,0,0,0.18)';

        const title = document.createElement('div');
        title.textContent = 'Gameplay Debug (Rapier)';
        title.style.fontSize = '12px';
        title.style.fontWeight = '950';
        title.style.letterSpacing = '0.7px';
        title.style.textTransform = 'uppercase';

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '8px';

        this.btnToggleLogs = makeBtn('Logs');
        this.btnClear = makeBtn('Clear');
        this.btnClose = makeBtn('✕');
        this.btnClose.style.padding = '6px 10px';

        btnRow.appendChild(this.btnToggleLogs);
        btnRow.appendChild(this.btnClear);
        btnRow.appendChild(this.btnClose);

        this.header.appendChild(title);
        this.header.appendChild(btnRow);
        this.root.appendChild(this.header);

        this.body = document.createElement('div');
        this.body.style.display = 'grid';
        this.body.style.gridTemplateColumns = '360px 1fr';
        this.body.style.height = 'calc(100% - 44px)';
        this.body.style.minHeight = '0';
        this.root.appendChild(this.body);

        this.left = document.createElement('div');
        this.left.style.padding = '10px 12px 12px';
        this.left.style.display = 'flex';
        this.left.style.flexDirection = 'column';
        this.left.style.gap = '10px';
        this.left.style.minWidth = '360px';
        this.left.style.maxWidth = '360px';
        this.left.style.borderRight = '1px solid rgba(255, 216, 77, 0.14)';
        this.left.style.overflowX = 'hidden';
        this.left.style.overflowY = 'auto';
        this.left.style.minHeight = '0';
        this.body.appendChild(this.left);

        this.logsWrap = document.createElement('div');
        this.logsWrap.style.padding = '10px 12px 12px';
        this.logsWrap.style.display = 'flex';
        this.logsWrap.style.flexDirection = 'column';
        this.logsWrap.style.gap = '8px';
        this.logsWrap.style.minWidth = '0';
        this.body.appendChild(this.logsWrap);

        this.treeWrap = document.createElement('div');
        this.treeWrap.style.display = 'flex';
        this.treeWrap.style.flexDirection = 'column';
        this.treeWrap.style.gap = '8px';
        this.treeWrap.style.minHeight = '140px';
        this.treeWrap.style.borderRadius = '12px';
        this.treeWrap.style.border = '1px solid rgba(255, 216, 77, 0.16)';
        this.treeWrap.style.background = 'rgba(0,0,0,0.22)';
        this.treeWrap.style.padding = '10px';
        this.logsWrap.appendChild(this.treeWrap);

        const keysTitle = document.createElement('div');
        keysTitle.textContent = 'Keys';
        keysTitle.style.fontSize = '12px';
        keysTitle.style.fontWeight = '950';
        keysTitle.style.opacity = '0.9';
        this.left.appendChild(keysTitle);

        this.keysRow = document.createElement('div');
        this.keysRow.style.display = 'flex';
        this.keysRow.style.flexWrap = 'wrap';
        this.keysRow.style.gap = '6px';
        this.keysRow.style.alignItems = 'center';
        this.left.appendChild(this.keysRow);

        this.keyPills = {
            left: makeKeyPill('←/A'),
            right: makeKeyPill('→/D'),
            up: makeKeyPill('↑/W'),
            down: makeKeyPill('↓/S'),
            space: makeKeyPill('Space'),
            h: makeKeyPill('H')
        };
        for (const pill of Object.values(this.keyPills)) {
            this.keysRow.appendChild(pill);
        }

        const inputTitle = document.createElement('div');
        inputTitle.textContent = 'Event Input → Rapier';
        inputTitle.style.fontSize = '12px';
        inputTitle.style.fontWeight = '950';
        inputTitle.style.opacity = '0.9';
        inputTitle.style.marginTop = '4px';
        this.left.appendChild(inputTitle);

        this.inputHint = makeSmallLabel('EventBus: input:controls');
        this.left.appendChild(this.inputHint);

        this.inputGrid = document.createElement('div');
        this.inputGrid.style.display = 'grid';
        this.inputGrid.style.gridTemplateColumns = '1fr';
        this.inputGrid.style.gap = '8px';
        this.left.appendChild(this.inputGrid);

        this._input = { steering: 0, throttle: 0, brake: 0, handbrake: 0, headlights: false };
        this._rapierInput = { steering: 0, throttle: 0, brake: 0, handbrake: 0 };

        const steerRow = document.createElement('div');
        steerRow.style.display = 'flex';
        steerRow.style.alignItems = 'center';
        steerRow.style.justifyContent = 'space-between';
        steerRow.style.gap = '10px';
        const steerLabel = document.createElement('div');
        steerLabel.textContent = 'Steer';
        steerLabel.style.fontSize = '12px';
        steerLabel.style.fontWeight = '900';
        steerLabel.style.opacity = '0.85';
        const steerViz = document.createElement('div');
        steerViz.style.display = 'flex';
        steerViz.style.alignItems = 'center';
        steerViz.style.gap = '8px';
        steerViz.style.minWidth = '180px';
        steerViz.style.justifyContent = 'flex-end';
        this.steerLeft = document.createElement('div');
        this.steerLeft.textContent = '←';
        this.steerLeft.style.fontWeight = '900';
        this.steerLeft.style.opacity = '0.35';
        this.steerMid = document.createElement('div');
        this.steerMid.textContent = '•';
        this.steerMid.style.opacity = '0.6';
        this.steerRight = document.createElement('div');
        this.steerRight.textContent = '→';
        this.steerRight.style.fontWeight = '900';
        this.steerRight.style.opacity = '0.35';
        this.steerVal = document.createElement('div');
        this.steerVal.style.fontWeight = '900';
        this.steerVal.style.opacity = '0.95';
        this.steerVal.textContent = '0.00';
        steerViz.appendChild(this.steerLeft);
        steerViz.appendChild(this.steerMid);
        steerViz.appendChild(this.steerRight);
        steerViz.appendChild(this.steerVal);
        steerRow.appendChild(steerLabel);
        steerRow.appendChild(steerViz);
        this.inputGrid.appendChild(steerRow);

        const throttleRow = document.createElement('div');
        throttleRow.style.display = 'flex';
        throttleRow.style.alignItems = 'center';
        throttleRow.style.justifyContent = 'space-between';
        throttleRow.style.gap = '10px';
        const throttleLabel = document.createElement('div');
        throttleLabel.textContent = 'Throttle';
        throttleLabel.style.fontSize = '12px';
        throttleLabel.style.fontWeight = '900';
        throttleLabel.style.opacity = '0.85';
        this.throttleBar = makeBar({ width: 170, height: 10 });
        throttleRow.appendChild(throttleLabel);
        throttleRow.appendChild(this.throttleBar.wrap);
        this.inputGrid.appendChild(throttleRow);

        const brakeRow = document.createElement('div');
        brakeRow.style.display = 'flex';
        brakeRow.style.alignItems = 'center';
        brakeRow.style.justifyContent = 'space-between';
        brakeRow.style.gap = '10px';
        const brakeLabel = document.createElement('div');
        brakeLabel.textContent = 'Brake';
        brakeLabel.style.fontSize = '12px';
        brakeLabel.style.fontWeight = '900';
        brakeLabel.style.opacity = '0.85';
        this.brakeBar = makeBar({ width: 170, height: 10 });
        this.brakeBar.fill.style.background = 'rgba(255, 95, 95, 0.85)';
        brakeRow.appendChild(brakeLabel);
        brakeRow.appendChild(this.brakeBar.wrap);
        this.inputGrid.appendChild(brakeRow);

        const togglesRow = document.createElement('div');
        togglesRow.style.display = 'flex';
        togglesRow.style.alignItems = 'center';
        togglesRow.style.justifyContent = 'space-between';
        togglesRow.style.gap = '10px';
        const togglesLabel = document.createElement('div');
        togglesLabel.textContent = 'Toggles';
        togglesLabel.style.fontSize = '12px';
        togglesLabel.style.fontWeight = '900';
        togglesLabel.style.opacity = '0.85';

        const toggles = document.createElement('div');
        toggles.style.display = 'flex';
        toggles.style.alignItems = 'center';
        toggles.style.gap = '12px';

        const hb = document.createElement('div');
        hb.style.display = 'flex';
        hb.style.alignItems = 'center';
        hb.style.gap = '6px';
        const hbDot = makeDot();
        const hbText = document.createElement('div');
        hbText.textContent = 'Handbrake';
        hbText.style.fontSize = '12px';
        hbText.style.fontWeight = '900';
        hbText.style.opacity = '0.9';
        hb.appendChild(hbDot);
        hb.appendChild(hbText);
        this._hbDot = hbDot;

        const hl = document.createElement('div');
        hl.style.display = 'flex';
        hl.style.alignItems = 'center';
        hl.style.gap = '6px';
        const hlDot = makeDot();
        const hlText = document.createElement('div');
        hlText.textContent = 'Headlights';
        hlText.style.fontSize = '12px';
        hlText.style.fontWeight = '900';
        hlText.style.opacity = '0.9';
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
        rapierInTitle.style.fontSize = '12px';
        rapierInTitle.style.fontWeight = '950';
        rapierInTitle.style.opacity = '0.9';
        rapierInTitle.style.marginTop = '4px';
        this.left.appendChild(rapierInTitle);
        this.left.appendChild(makeSmallLabel('RapierVehicleSim entry.input'));

        this.rapierInputGrid = document.createElement('div');
        this.rapierInputGrid.style.display = 'grid';
        this.rapierInputGrid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        this.rapierInputGrid.style.gap = '8px 10px';
        this.left.appendChild(this.rapierInputGrid);

        this.rapierInSteer = makeValueRow('Steer');
        this.rapierInputGrid.appendChild(this.rapierInSteer.row);
        this.rapierInThrottle = makeValueRow('Throttle');
        this.rapierInputGrid.appendChild(this.rapierInThrottle.row);
        this.rapierInBrake = makeValueRow('Brake');
        this.rapierInputGrid.appendChild(this.rapierInBrake.row);
        this.rapierInHB = makeValueRow('Handbrake');
        this.rapierInputGrid.appendChild(this.rapierInHB.row);

        const outTitle = document.createElement('div');
        outTitle.textContent = 'Vehicle Output';
        outTitle.style.fontSize = '12px';
        outTitle.style.fontWeight = '950';
        outTitle.style.opacity = '0.9';
        outTitle.style.marginTop = '4px';
        this.left.appendChild(outTitle);
        this.left.appendChild(makeSmallLabel('Rapier + EngineSim (computed)'));

        this.outputGrid = document.createElement('div');
        this.outputGrid.style.display = 'grid';
        this.outputGrid.style.gridTemplateColumns = '1fr';
        this.outputGrid.style.gap = '8px';
        this.left.appendChild(this.outputGrid);

        const readyRow = document.createElement('div');
        readyRow.style.display = 'flex';
        readyRow.style.alignItems = 'center';
        readyRow.style.justifyContent = 'space-between';
        readyRow.style.gap = '10px';
        const readyLabel = document.createElement('div');
        readyLabel.textContent = 'Vehicle';
        readyLabel.style.fontSize = '12px';
        readyLabel.style.fontWeight = '900';
        readyLabel.style.opacity = '0.85';
        const readyR = document.createElement('div');
        readyR.style.display = 'flex';
        readyR.style.alignItems = 'center';
        readyR.style.gap = '8px';
        this.readyDot = makeDot();
        this.readyText = document.createElement('div');
        this.readyText.textContent = '—';
        this.readyText.style.fontSize = '12px';
        this.readyText.style.fontWeight = '900';
        this.readyText.style.opacity = '0.95';
        readyR.appendChild(this.readyDot);
        readyR.appendChild(this.readyText);
        readyRow.appendChild(readyLabel);
        readyRow.appendChild(readyR);
        this.outputGrid.appendChild(readyRow);

        this.speedRow = makeValueRow('Speed (km/h)');
        this.outputGrid.appendChild(this.speedRow.row);
        this.yawRow = makeValueRow('Yaw (deg)');
        this.outputGrid.appendChild(this.yawRow.row);
        this.gearRow = makeValueRow('Gear');
        this.outputGrid.appendChild(this.gearRow.row);
        this.rpmRow = makeValueRow('RPM (engine sim)');
        this.outputGrid.appendChild(this.rpmRow.row);

        this.driveRow = makeValueRow('DriveF');
        this.outputGrid.appendChild(this.driveRow.row);
        this.brakeForceRow = makeValueRow('BrakeF');
        this.outputGrid.appendChild(this.brakeForceRow.row);

        const wheelsRow = document.createElement('div');
        wheelsRow.style.display = 'flex';
        wheelsRow.style.alignItems = 'flex-start';
        wheelsRow.style.justifyContent = 'space-between';
        wheelsRow.style.gap = '10px';
        const wheelsLabel = document.createElement('div');
        wheelsLabel.textContent = 'Wheels';
        wheelsLabel.style.fontSize = '12px';
        wheelsLabel.style.fontWeight = '900';
        wheelsLabel.style.opacity = '0.85';
        wheelsLabel.style.paddingTop = '4px';

        this.wheelsDots = document.createElement('div');
        this.wheelsDots.style.display = 'flex';
        this.wheelsDots.style.flexDirection = 'column';
        this.wheelsDots.style.alignItems = 'stretch';
        this.wheelsDots.style.justifyContent = 'flex-start';
        this.wheelsDots.style.gap = '6px';
        this.wheelsDots.style.minWidth = '220px';
        this._wheelCells = [];
        this._wheelSig = '';

        wheelsRow.appendChild(wheelsLabel);
        wheelsRow.appendChild(this.wheelsDots);
        this.outputGrid.appendChild(wheelsRow);

        const logsTitleRow = document.createElement('div');
        logsTitleRow.style.display = 'flex';
        logsTitleRow.style.alignItems = 'center';
        logsTitleRow.style.justifyContent = 'space-between';
        logsTitleRow.style.gap = '10px';
        const logsTitle = document.createElement('div');
        logsTitle.textContent = 'Logs';
        logsTitle.style.fontSize = '12px';
        logsTitle.style.fontWeight = '950';
        logsTitle.style.opacity = '0.9';
        this.logsHint = document.createElement('div');
        this.logsHint.textContent = '';
        this.logsHint.style.fontSize = '11px';
        this.logsHint.style.fontWeight = '900';
        this.logsHint.style.opacity = '0.55';
        this.logsHint.style.display = 'none';
        logsTitleRow.appendChild(logsTitle);
        logsTitleRow.appendChild(this.logsHint);
        this.logsWrap.appendChild(logsTitleRow);

        this.logs = document.createElement('div');
        this.logs.style.flex = '1 1 auto';
        this.logs.style.minHeight = '0';
        this.logs.style.overflow = 'auto';
        this.logs.style.padding = '8px 10px';
        this.logs.style.borderRadius = '12px';
        this.logs.style.border = '1px solid rgba(255, 216, 77, 0.16)';
        this.logs.style.background = 'rgba(0,0,0,0.30)';
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
        if (this._expanded) {
            this.btnToggleLogs.textContent = 'Logs: On';
            this.body.style.gridTemplateColumns = '360px 1fr';
            this.root.style.minWidth = '620px';
        } else {
            this.btnToggleLogs.textContent = 'Logs: Off';
            this.body.style.gridTemplateColumns = '360px 0px';
            this.root.style.minWidth = '380px';
        }
        this._scheduleMinHeightRefresh();
    }

    log(message) {
        if (this._destroyed) return;
        const line = document.createElement('div');
        line.style.whiteSpace = 'pre-wrap';
        line.style.wordBreak = 'break-word';
        line.style.fontSize = '12px';
        line.style.fontWeight = '800';
        line.style.opacity = '0.92';
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
        this.steerLeft.style.opacity = s < -0.02 ? '1' : '0.35';
        this.steerRight.style.opacity = s > 0.02 ? '1' : '0.35';

        setBar(this.throttleBar, clamp(this._input.throttle, 0, 1));
        setBar(this.brakeBar, clamp(this._input.brake, 0, 1));
        setDot(this._hbDot, (this._input.handbrake ?? 0) > 0.5, { onColor: '#ffcc33', offColor: 'rgba(255, 216, 77, 0.12)' });
        setDot(this._hlDot, !!this._input.headlights, { onColor: '#7bb6ff', offColor: 'rgba(255, 216, 77, 0.12)' });
    }

    setRapierDebug(debug) {
        if (this._destroyed) return;
        if (!debug) {
            setDot(this.readyDot, false);
            this.readyText.textContent = '—';
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
        const driveF = debug.forces?.driveForce ?? 0;
        const brakeF = debug.forces?.brakeForce ?? 0;

        this.speedRow.v.textContent = fmt(speedKph, 1);
        this.yawRow.v.textContent = fmt(yawDeg, 1);
        this.gearRow.v.textContent = gearLabel != null ? String(gearLabel) : '—';
        this.rpmRow.v.textContent = fmt(rpm, 0);
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
                cell.style.display = 'grid';
                cell.style.gridTemplateColumns = '16px 14px 14px';
                cell.style.alignItems = 'center';
                cell.style.columnGap = '8px';
                cell.style.padding = '4px 6px';
                cell.style.borderRadius = '10px';
                cell.style.border = '1px solid rgba(255, 216, 77, 0.14)';
                cell.style.background = 'rgba(0,0,0,0.14)';
                cell.style.minWidth = '0';
                if (labelText) cell.title = labelText;

                const dot = makeDot();
                dot.style.width = '12px';
                dot.style.height = '12px';

                const yaw = makeYawArrow();
                const spin = makeSpinViz();

                cell.appendChild(dot);
                cell.appendChild(yaw);
                cell.appendChild(spin.wrap);

                return { cell, dot, yaw, spinNeedle: spin.needle };
            };

            for (const g of orderedGroups) {
                const row = document.createElement('div');
                row.style.display = 'grid';
                row.style.gridTemplateColumns = '1fr 1fr';
                row.style.columnGap = '10px';
                row.style.alignItems = 'center';

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
            setDot(cell.dot, inContact, { onColor: '#50ff9a', offColor: 'rgba(255, 95, 95, 0.35)' });
            if (cell.row) {
                cell.cell.style.opacity = w ? (inContact ? '1' : '0.78') : '0.45';
            }

            const steerRad = (w && Number.isFinite(w.steering)) ? w.steering : 0;
            // UI convention: positive = right, rapier steering is applied with inverted sign.
            const steerDeg = -radToDeg(steerRad);
            if (cell.yaw) {
                cell.yaw.style.transform = `rotate(${steerDeg.toFixed(1)}deg)`;
                cell.yaw.style.opacity = w ? (inContact ? '1' : '0.65') : '0.25';
            }
            if (cell.spinNeedle) {
                cell.spinNeedle.style.transform = `translate(0, -50%) rotate(${(this._lastSpinDeg ?? 0).toFixed(1)}deg)`;
                cell.spinNeedle.style.opacity = w ? (inContact ? '1' : '0.6') : '0.25';
            }
        }
    }

    _buildTreeHeader() {
        this.treeHeader = document.createElement('div');
        this.treeHeader.style.display = 'flex';
        this.treeHeader.style.alignItems = 'center';
        this.treeHeader.style.justifyContent = 'space-between';
        this.treeHeader.style.gap = '10px';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '8px';

        this.treeModeSel = document.createElement('select');
        this.treeModeSel.style.pointerEvents = 'auto';
        this.treeModeSel.style.border = '1px solid rgba(255, 216, 77, 0.22)';
        this.treeModeSel.style.background = 'rgba(0,0,0,0.22)';
        this.treeModeSel.style.color = '#ffd84d';
        this.treeModeSel.style.borderRadius = '10px';
        this.treeModeSel.style.padding = '6px 8px';
        this.treeModeSel.style.fontSize = '12px';
        this.treeModeSel.style.fontWeight = '900';
        for (const opt of [
            { value: 'rapier', label: 'Rapier' },
            { value: 'event', label: 'Event input' },
            { value: 'scene', label: 'jtree' },
            { value: 'skeleton', label: 'Skeleton' }
        ]) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            this.treeModeSel.appendChild(o);
        }
        this.treeModeSel.value = this._treeMode;
        this.treeModeSel.addEventListener('change', () => {
            this._treeMode = this.treeModeSel.value;
            this._refreshTree({ force: true });
        });
        left.appendChild(this.treeModeSel);

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.alignItems = 'center';
        right.style.gap = '8px';

        this.btnTreeToggle = makeBtn('Tree: On');
        this.btnTreeToggle.addEventListener('click', () => {
            this._treeExpanded = !this._treeExpanded;
            this.btnTreeToggle.textContent = this._treeExpanded ? 'Tree: On' : 'Tree: Off';
            this.treeBody.style.display = this._treeExpanded ? 'block' : 'none';
            this._scheduleMinHeightRefresh();
        });

        this.btnTreeAuto = makeBtn('Auto: On');
        this.btnTreeAuto.addEventListener('click', () => {
            this._treeAuto = !this._treeAuto;
            this.btnTreeAuto.textContent = this._treeAuto ? 'Auto: On' : 'Auto: Off';
        });

        this.btnTreeRefresh = makeBtn('Refresh');
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
        this.treeBody.style.display = 'block';
        this.treeBody.style.overflow = 'auto';
        this.treeBody.style.maxHeight = '220px';
        this.treeBody.style.padding = '6px 2px 2px';
        this.treeBody.style.fontSize = '12px';
        this.treeBody.style.fontWeight = '800';
        this.treeBody.style.opacity = '0.95';
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
        } else if (this._treeMode === 'skeleton') {
            title = 'bus skeleton';
            data = this._packSkeleton(this._ctx.api);
        }

        this.treeBody.innerHTML = '';
        const hint = document.createElement('div');
        hint.textContent = title;
        hint.style.fontSize = '11px';
        hint.style.fontWeight = '900';
        hint.style.opacity = '0.7';
        hint.style.marginBottom = '6px';
        this.treeBody.appendChild(hint);

        if (data == null) {
            const empty = document.createElement('div');
            empty.textContent = '—';
            empty.style.opacity = '0.65';
            this.treeBody.appendChild(empty);
            return;
        }

        this.treeBody.appendChild(this._renderTreeNode('$', data, '$', 0));
    }

    _renderTreeNode(key, value, path, depth) {
        const row = document.createElement('div');
        row.style.display = 'block';
        row.style.paddingLeft = `${depth * 12}px`;
        row.style.lineHeight = '1.35';

        const isObj = isPlainObject(value);
        const isArr = Array.isArray(value);
        const isExpandable = isObj || isArr;
        const isOpen = this._treeExpandState.get(path) ?? (depth < 1);

        const head = document.createElement('div');
        head.style.display = 'flex';
        head.style.alignItems = 'center';
        head.style.gap = '8px';
        head.style.cursor = isExpandable ? 'pointer' : 'default';

        const caret = document.createElement('div');
        caret.textContent = isExpandable ? (isOpen ? '▾' : '▸') : ' ';
        caret.style.width = '14px';
        caret.style.opacity = isExpandable ? '0.9' : '0.3';

        const k = document.createElement('div');
        k.textContent = String(key);
        k.style.fontWeight = '950';
        k.style.opacity = '0.92';

        const v = document.createElement('div');
        v.style.opacity = '0.85';
        v.style.whiteSpace = 'pre';
        v.style.overflow = 'hidden';
        v.style.textOverflow = 'ellipsis';
        v.style.flex = '1';

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

    _packSkeleton(api) {
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
        const pad = 6; // borders + rounding safety
        const minH = Math.max(0, Math.ceil(headerH + leftH + pad));
        this.root.style.minHeight = `${minH}px`;
    }
}

function q(v) {
    return Number.isFinite(v) ? Number(v.toFixed(3)) : null;
}
