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

export class GameplayDebugPanel {
    constructor({ events } = {}) {
        this.events = events ?? null;
        this._expanded = true;
        this._destroyed = false;
        this._maxLogLines = 350;

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
        this.body.style.gridTemplateColumns = '420px 1fr';
        this.body.style.height = 'calc(100% - 44px)';
        this.body.style.minHeight = '0';
        this.root.appendChild(this.body);

        this.left = document.createElement('div');
        this.left.style.padding = '10px 12px 12px';
        this.left.style.display = 'flex';
        this.left.style.flexDirection = 'column';
        this.left.style.gap = '10px';
        this.left.style.minWidth = '420px';
        this.left.style.maxWidth = '420px';
        this.left.style.borderRight = '1px solid rgba(255, 216, 77, 0.14)';
        this.left.style.overflow = 'hidden';
        this.body.appendChild(this.left);

        this.logsWrap = document.createElement('div');
        this.logsWrap.style.padding = '10px 12px 12px';
        this.logsWrap.style.display = 'flex';
        this.logsWrap.style.flexDirection = 'column';
        this.logsWrap.style.gap = '8px';
        this.logsWrap.style.minWidth = '0';
        this.body.appendChild(this.logsWrap);

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
        inputTitle.textContent = 'Input → Physics';
        inputTitle.style.fontSize = '12px';
        inputTitle.style.fontWeight = '950';
        inputTitle.style.opacity = '0.9';
        inputTitle.style.marginTop = '4px';
        this.left.appendChild(inputTitle);

        this.inputGrid = document.createElement('div');
        this.inputGrid.style.display = 'grid';
        this.inputGrid.style.gridTemplateColumns = '1fr';
        this.inputGrid.style.gap = '8px';
        this.left.appendChild(this.inputGrid);

        this._input = { steering: 0, throttle: 0, brake: 0, handbrake: 0, headlights: false };

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

        const outTitle = document.createElement('div');
        outTitle.textContent = 'Rapier Output';
        outTitle.style.fontSize = '12px';
        outTitle.style.fontWeight = '950';
        outTitle.style.opacity = '0.9';
        outTitle.style.marginTop = '4px';
        this.left.appendChild(outTitle);

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
        this.rpmRow = makeValueRow('RPM');
        this.outputGrid.appendChild(this.rpmRow.row);

        this.driveRow = makeValueRow('DriveF');
        this.outputGrid.appendChild(this.driveRow.row);
        this.brakeForceRow = makeValueRow('BrakeF');
        this.outputGrid.appendChild(this.brakeForceRow.row);

        const wheelsRow = document.createElement('div');
        wheelsRow.style.display = 'flex';
        wheelsRow.style.alignItems = 'center';
        wheelsRow.style.justifyContent = 'space-between';
        wheelsRow.style.gap = '10px';
        const wheelsLabel = document.createElement('div');
        wheelsLabel.textContent = 'Wheels';
        wheelsLabel.style.fontSize = '12px';
        wheelsLabel.style.fontWeight = '900';
        wheelsLabel.style.opacity = '0.85';

        const wheelsDots = document.createElement('div');
        wheelsDots.style.display = 'flex';
        wheelsDots.style.alignItems = 'center';
        wheelsDots.style.gap = '10px';
        wheelsDots.style.justifyContent = 'flex-end';

        const makeWheel = (label) => {
            const w = document.createElement('div');
            w.style.display = 'flex';
            w.style.alignItems = 'center';
            w.style.gap = '6px';
            const dot = makeDot();
            const t = document.createElement('div');
            t.textContent = label;
            t.style.fontSize = '12px';
            t.style.fontWeight = '900';
            t.style.opacity = '0.95';
            w.appendChild(dot);
            w.appendChild(t);
            return { w, dot };
        };

        this.wheelDots = {
            FL: makeWheel('FL'),
            FR: makeWheel('FR'),
            RL: makeWheel('RL'),
            RR: makeWheel('RR')
        };
        for (const k of ['FL', 'FR', 'RL', 'RR']) wheelsDots.appendChild(this.wheelDots[k].w);
        wheelsRow.appendChild(wheelsLabel);
        wheelsRow.appendChild(wheelsDots);
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
        this.logsHint.textContent = 'drag header • resize corner';
        this.logsHint.style.fontSize = '11px';
        this.logsHint.style.fontWeight = '900';
        this.logsHint.style.opacity = '0.55';
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

    setExpanded(expanded) {
        this._expanded = !!expanded;
        if (this._expanded) {
            this.btnToggleLogs.textContent = 'Logs: On';
            this.body.style.gridTemplateColumns = '420px 1fr';
            this.root.style.minWidth = '680px';
        } else {
            this.btnToggleLogs.textContent = 'Logs: Off';
            this.body.style.gridTemplateColumns = '420px 0px';
            this.root.style.minWidth = '440px';
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
            return;
        }

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
        const byLabel = new Map();
        for (const w of wheels) {
            const label = String(w?.label ?? '');
            if (label) byLabel.set(label, w);
        }
        for (const label of ['FL', 'FR', 'RL', 'RR']) {
            const w = byLabel.get(label);
            const inContact = w ? !!w.inContact : false;
            setDot(this.wheelDots[label].dot, inContact, { onColor: '#50ff9a', offColor: 'rgba(255, 95, 95, 0.35)' });
        }
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
