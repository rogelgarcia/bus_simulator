// src/graphics/gui/debug_corners2/DebugCorners2UI.js
// UI panels for Debug Corners 2 (options, legend, and telemetry).

function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Number(v) | 0));
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function fmtNum(v, digits = 2) {
    return Number.isFinite(v) ? v.toFixed(digits) : '--';
}

function fmtVec(p, digits = 2) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return '--';
    return `${p.x.toFixed(digits)}, ${p.z.toFixed(digits)}`;
}

function fmtYawRad(yaw) {
    const y = Number(yaw) || 0;
    return fmtNum((y * 180) / Math.PI, 1);
}

export class DebugCorners2OptionsPanel {
    constructor(view) {
        this.view = view;
        this.root = document.createElement('div');
        this.root.className = 'debug-corners2-panel debug-corners2-panel-left';

        const title = document.createElement('div');
        title.className = 'debug-corners2-title';
        title.textContent = 'Debug Corners 2';
        this.root.appendChild(title);

        this.toggles = this._togglesSection();
        this.root.appendChild(this.toggles.section);

        this.radiusRow = this._numberRow('Fillet radius', view._filletRadius, 0, 50, 0.25);
        this.root.appendChild(this.radiusRow.row);

        this.roadASection = this._roadSection('Road A', 'A');
        this.root.appendChild(this.roadASection);
        this.roadBSection = this._roadSection('Road B', 'B');
        this.root.appendChild(this.roadBSection);

        this._wireEvents();
        this.sync();
    }

    _toggleRow(labelText) {
        const row = document.createElement('label');
        row.className = 'debug-corners2-row debug-corners2-toggle';

        const left = document.createElement('div');
        left.className = 'debug-corners2-label';
        left.textContent = labelText;

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = toggleId(labelText);
        input.className = 'debug-corners2-checkbox';

        row.appendChild(left);
        row.appendChild(input);
        return { row, input };
    }

    _wireEvents() {
        const toggle = (key, value) => {
            const opts = {};
            opts[key] = value;
            this.view.setDebugOptions(opts);
        };

        this.toggles.asphalt.addEventListener('change', () => toggle('renderAsphalt', this.toggles.asphalt.checked));
        this.toggles.edges.addEventListener('change', () => toggle('renderEdges', this.toggles.edges.checked));
        this.toggles.centerline.addEventListener('change', () => toggle('renderCenterline', this.toggles.centerline.checked));
        this.toggles.connecting.addEventListener('change', () => toggle('showConnectingPoint', this.toggles.connecting.checked));

        this.radiusRow.input.addEventListener('change', () => {
            this.view.setFilletRadius(Number(this.radiusRow.input.value) || 0);
        });
    }

    _togglesSection() {
        const section = document.createElement('div');
        section.className = 'debug-corners2-section';

        const title = document.createElement('div');
        title.className = 'debug-corners2-section-title';
        title.textContent = 'Debug options';
        section.appendChild(title);

        const asphalt = this._toggleRow('Render asphalt');
        const edges = this._toggleRow('Render edges');
        const centerline = this._toggleRow('Render centerline');
        const connecting = this._toggleRow('Show connecting point');

        section.appendChild(asphalt.row);
        section.appendChild(edges.row);
        section.appendChild(centerline.row);
        section.appendChild(connecting.row);

        return {
            section,
            asphalt: asphalt.input,
            edges: edges.input,
            centerline: centerline.input,
            connecting: connecting.input
        };
    }

    _roadSection(label, key) {
        const wrap = document.createElement('div');
        wrap.className = 'debug-corners2-section';

        const title = document.createElement('div');
        title.className = 'debug-corners2-section-title';
        title.textContent = label;
        wrap.appendChild(title);

        const lanesRow = this._numberRow('Lanes', this.view._roadsByKey.get(key)?.lanes ?? 2, 1, 20, 1);
        lanesRow.input.addEventListener('change', () => {
            this.view.setRoadConfig(key, { lanes: clampInt(lanesRow.input.value, 1, 20) });
        });
        wrap.appendChild(lanesRow.row);

        const yawRow = this._numberRow('Yaw (deg)', 0, -720, 720, 1);
        yawRow.input.addEventListener('change', () => {
            const deg = clamp(Number(yawRow.input.value) || 0, -720, 720);
            this.view.setRoadConfig(key, { yaw: (deg * Math.PI) / 180 });
        });
        wrap.appendChild(yawRow.row);

        const edgeRow = document.createElement('div');
        edgeRow.className = 'debug-corners2-row';
        const edgeLabel = document.createElement('div');
        edgeLabel.className = 'debug-corners2-label';
        edgeLabel.textContent = 'Target edge';
        const edgeControls = document.createElement('div');
        edgeControls.className = 'debug-corners2-edge-buttons';
        const left = document.createElement('button');
        left.type = 'button';
        left.textContent = 'Left';
        const right = document.createElement('button');
        right.type = 'button';
        right.textContent = 'Right';
        edgeControls.appendChild(left);
        edgeControls.appendChild(right);
        edgeRow.appendChild(edgeLabel);
        edgeRow.appendChild(edgeControls);
        wrap.appendChild(edgeRow);

        left.addEventListener('click', () => this.view.setRoadConfig(key, { targetEdge: 'left' }));
        right.addEventListener('click', () => this.view.setRoadConfig(key, { targetEdge: 'right' }));

        wrap._rows = { lanesRow, yawRow, left, right };
        return wrap;
    }

    _numberRow(labelText, value, min, max, step) {
        const row = document.createElement('div');
        row.className = 'debug-corners2-row';
        const label = document.createElement('div');
        label.className = 'debug-corners2-label';
        label.textContent = labelText;
        const input = document.createElement('input');
        input.className = 'debug-corners2-input';
        input.type = 'number';
        input.value = String(Number.isFinite(value) ? value : 0);
        if (Number.isFinite(min)) input.min = String(min);
        if (Number.isFinite(max)) input.max = String(max);
        if (Number.isFinite(step)) input.step = String(step);
        row.appendChild(label);
        row.appendChild(input);
        return { row, label, input };
    }

    sync() {
        if (!this.view) return;
        const opts = this.view.getDebugOptions?.() ?? {};
        this.toggles.asphalt.checked = opts.renderAsphalt !== false;
        this.toggles.edges.checked = opts.renderEdges !== false;
        this.toggles.centerline.checked = opts.renderCenterline !== false;
        this.toggles.connecting.checked = opts.showConnectingPoint === true;

        this.radiusRow.input.value = String(Number.isFinite(this.view._filletRadius) ? this.view._filletRadius : 0);

        for (const key of ['A', 'B']) {
            const road = this.view._roadsByKey.get(key);
            const section = key === 'A' ? this.roadASection : this.roadBSection;
            if (!road || !section?._rows) continue;
            section._rows.lanesRow.input.value = String(Number.isFinite(road.lanes) ? road.lanes : 2);
            section._rows.yawRow.input.value = fmtYawRad(road.yaw);
            const isLeft = (road.targetEdge ?? 'left') === 'left';
            section._rows.left.classList.toggle('is-active', isLeft);
            section._rows.right.classList.toggle('is-active', !isLeft);
        }
    }

    attach(parent = document.body) {
        if (!this.root.isConnected) parent.appendChild(this.root);
    }

    destroy() {
        if (this.root.isConnected) this.root.remove();
        this.view = null;
    }
}

export class DebugCorners2LegendPanel {
    constructor(view) {
        this.view = view;
        this.root = document.createElement('div');
        this.root.className = 'debug-corners2-panel debug-corners2-panel-topright';

        const title = document.createElement('div');
        title.className = 'debug-corners2-title';
        title.textContent = 'Legend';
        this.root.appendChild(title);

        const rows = document.createElement('div');
        rows.className = 'debug-corners2-legend';

        const add = (label, color) => {
            const row = document.createElement('div');
            row.className = 'debug-corners2-legend-row';
            const sw = document.createElement('span');
            sw.className = 'debug-corners2-swatch';
            sw.style.background = color;
            const text = document.createElement('span');
            text.textContent = label;
            row.appendChild(sw);
            row.appendChild(text);
            rows.appendChild(row);
        };

        add('Centerline', '#e5e7eb');
        add('Edges', '#fbbf24');
        add('Selected edge (A)', '#fb923c');
        add('Selected edge (B)', '#34d399');
        add('Connecting point', '#60a5fa');
        add('Active road marker', '#2d7be8');

        this.root.appendChild(rows);
    }

    sync() {
        return;
    }

    attach(parent = document.body) {
        if (!this.root.isConnected) parent.appendChild(this.root);
    }

    destroy() {
        if (this.root.isConnected) this.root.remove();
        this.view = null;
    }
}

export class DebugCorners2TelemetryPanel {
    constructor(view) {
        this.view = view;
        this.root = document.createElement('div');
        this.root.className = 'debug-corners2-panel debug-corners2-panel-bottomright';

        const title = document.createElement('div');
        title.className = 'debug-corners2-title';
        title.textContent = 'Edge Telemetry';
        this.root.appendChild(title);

        this.lines = document.createElement('pre');
        this.lines.className = 'debug-corners2-telemetry';
        this.root.appendChild(this.lines);
        this.sync();
    }

    sync() {
        const t = this.view?.getTelemetry?.() ?? {};
        const ok = t.ok === true;
        const rA = t.roads?.A ?? {};
        const rB = t.roads?.B ?? {};
        const join = t.join ?? null;

        const parts = [];
        parts.push(`Status: ${ok ? 'OK' : '—'}`);
        if (!ok && t.reason) parts.push(`Reason: ${t.reason}`);

        parts.push('');
        parts.push(`Road A: lanes=${rA.lanes ?? '--'} width=${fmtNum(rA.width)} yaw=${fmtYawRad(rA.yaw)}deg`);
        parts.push(`Road B: lanes=${rB.lanes ?? '--'} width=${fmtNum(rB.width)} yaw=${fmtYawRad(rB.yaw)}deg`);

        parts.push('');
        parts.push(`A connect: ${fmtVec(rA.connectingPoint)}`);
        parts.push(`B connect: ${fmtVec(rB.connectingPoint)}`);

        if (join) {
            parts.push('');
            parts.push(`Join: cutback=${fmtNum(join.cutback)} points=${join.pointCount ?? '--'}`);
            if (join.edge12) parts.push(`Fillet edge12: r=${fmtNum(join.edge12.radius)} trim0=${fmtNum(join.edge12.trim0)} trim1=${fmtNum(join.edge12.trim1)}`);
            if (join.edge30) parts.push(`Fillet edge30: r=${fmtNum(join.edge30.radius)} trim0=${fmtNum(join.edge30.trim0)} trim1=${fmtNum(join.edge30.trim1)}`);
        }

        this.lines.textContent = parts.join('\n');
    }

    attach(parent = document.body) {
        if (!this.root.isConnected) parent.appendChild(this.root);
    }

    destroy() {
        if (this.root.isConnected) this.root.remove();
        this.view = null;
    }
}

export function setupPanels(view) {
    view.optionsPanel = new DebugCorners2OptionsPanel(view);
    view.optionsPanel.attach(document.body);
    view.legendPanel = new DebugCorners2LegendPanel(view);
    view.legendPanel.attach(document.body);
    view.telemetryPanel = new DebugCorners2TelemetryPanel(view);
    view.telemetryPanel.attach(document.body);
}

export function destroyPanels(view) {
    view.optionsPanel?.destroy();
    view.optionsPanel = null;
    view.legendPanel?.destroy();
    view.legendPanel = null;
    view.telemetryPanel?.destroy();
    view.telemetryPanel = null;
}

export function syncPanels(view) {
    view.optionsPanel?.sync?.();
    view.legendPanel?.sync?.();
    view.telemetryPanel?.sync?.();
}

function toggleId(label) {
    return `debug-corners2-toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
