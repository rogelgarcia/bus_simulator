// src/graphics/gui/perf_bar/PerfBar.js
// Global performance/status bar UI.
// @ts-check

import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';

const GLOBAL_CLASS_ENABLED = 'perf-bar-enabled';
const GLOBAL_CLASS_HIDDEN = 'perf-bar-hidden';

function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function formatCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'N/A';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
    if (abs >= 100_000) return `${Math.round(n / 1000)}k`;
    if (abs >= 10_000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.round(n)}`;
}

function tryGetWebGLDebugInfo(gl) {
    const g = gl && typeof gl === 'object' ? gl : null;
    if (!g?.getExtension || !g?.getParameter) return null;
    const ext = g.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return null;
    try {
        return {
            vendor: g.getParameter(ext.UNMASKED_VENDOR_WEBGL),
            renderer: g.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        };
    } catch {
        return null;
    }
}

function getRendererInfo(renderer) {
    const r = renderer && typeof renderer === 'object' ? renderer : null;
    const gl = r?.getContext?.();
    const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const api = isWebGL2 ? 'WebGL2' : 'WebGL';

    const base = {
        api,
        version: null,
        vendor: null,
        renderer: null
    };

    if (!gl || typeof gl.getParameter !== 'function') return base;

    try {
        base.version = gl.getParameter(gl.VERSION) ?? null;
        base.vendor = gl.getParameter(gl.VENDOR) ?? null;
        base.renderer = gl.getParameter(gl.RENDERER) ?? null;
    } catch {
    }

    const dbg = tryGetWebGLDebugInfo(gl);
    if (dbg?.vendor) base.vendor = dbg.vendor;
    if (dbg?.renderer) base.renderer = dbg.renderer;
    return base;
}

function simplifyGpuLabel(label) {
    let s = typeof label === 'string' ? label.trim() : '';
    if (!s) return '';

    const angle = s.match(/^ANGLE\s*\((.*)\)\s*$/i);
    if (angle && angle[1]) s = angle[1].trim();

    const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
        const gpuLike = parts.find((p) => /(geforce|rtx|gtx|radeon|intel|iris|uhd|apple|adreno|mali|powervr|tesla|quadro)/i.test(p));
        s = gpuLike ?? parts[1];
    }

    const cutTokens = ['Direct3D', 'D3D', 'OpenGL', 'Vulkan', 'Metal'];
    for (const token of cutTokens) {
        const idx = s.toLowerCase().indexOf(token.toLowerCase());
        if (idx > 0) {
            s = s.slice(0, idx).trim();
            break;
        }
    }

    s = s.replace(/\b(vs|ps|fs|gs|cs)_[0-9_]+\b/gi, ' ');
    s = s.replace(/\bLaptop GPU\b/gi, ' ');
    s = s.replace(/\/PCIe\/SSE2\b/gi, ' ');
    s = s.replace(/\/SSE2\b/gi, ' ');
    s = s.replace(/\s+/g, ' ').trim();

    return s;
}

function formatRendererLabel(info) {
    const i = info && typeof info === 'object' ? info : null;
    const api = typeof i?.api === 'string' && i.api ? i.api : 'WebGL';
    const rendererRaw = typeof i?.renderer === 'string' && i.renderer ? i.renderer : '';
    const vendorRaw = typeof i?.vendor === 'string' && i.vendor ? i.vendor : '';

    const gpu = simplifyGpuLabel(rendererRaw) || simplifyGpuLabel(vendorRaw);
    return gpu ? `${api} · ${gpu}` : api;
}

export class PerfBar {
    constructor({
        fpsWarnBelow = 30,
        updateIntervalMs = 250
    } = {}) {
        this._fpsWarnBelow = clamp(fpsWarnBelow, 5, 240, 30);
        this._updateIntervalMs = clamp(updateIntervalMs, 50, 2000, 250);

        this.root = null;
        this._hidden = false;

        this._renderer = null;
        this._rendererInfo = null;
        this._gpuFrameTimer = null;

        this._frame = {
            lastNowMs: 0,
            emaMs: 0,
            lastUpdateMs: 0
        };

        this._forceUpdate = false;

        this._els = {
            fpsText: null,
            gpuMsText: null,
            renderText: null,
            memoryText: null,
            gpuText: null,
            btnToggle: null,
            iconToggle: null,
            btnDockToggle: null,
            iconDockToggle: null
        };

        this._onDocKeyDown = (e) => {
            if (!e) return;
            const code = e.code;
            const key = e.key;
            const ctrl = !!e.ctrlKey;
            const shift = !!e.shiftKey;

            if (!(ctrl && shift)) return;
            if (code !== 'KeyP' && key !== 'P' && key !== 'p') return;

            e.preventDefault();
            this.setHidden(!this.isHidden());
        };
    }

    requestUpdate() {
        this._forceUpdate = true;
    }

    mount(parent = document.body) {
        if (this.root) return this.root;
        const host = parent && typeof parent === 'object' ? parent : document.body;
        if (!host) throw new Error('[PerfBar] Missing mount host');

        const root = document.createElement('div');
        root.id = 'ui-perf-bar';
        root.className = 'ui-perf-bar';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-label', 'Performance status');

        const left = document.createElement('div');
        left.className = 'ui-perf-bar-left';
        left.addEventListener('wheel', (e) => {
            if (!e) return;
            if (left.scrollWidth <= left.clientWidth) return;
            const dx = Number.isFinite(e.deltaX) ? e.deltaX : 0;
            const dy = Number.isFinite(e.deltaY) ? e.deltaY : 0;
            const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
            if (!delta) return;
            e.preventDefault();
            left.scrollLeft += delta;
        }, { passive: false });

        const fps = document.createElement('div');
        fps.className = 'ui-perf-bar-item ui-perf-bar-fps';
        fps.textContent = 'FPS: -- (-- ms)';

        const gpuMs = document.createElement('div');
        gpuMs.className = 'ui-perf-bar-item ui-perf-bar-gpu-ms';
        gpuMs.textContent = 'GPUms: N/A';

        const render = document.createElement('div');
        render.className = 'ui-perf-bar-item ui-perf-bar-render';
        render.textContent = 'Calls: -- · Tris: -- · Lines: -- · Pts: --';

        const memory = document.createElement('div');
        memory.className = 'ui-perf-bar-item ui-perf-bar-memory';
        memory.textContent = 'Geo: -- · Tex: -- · Progs: --';

        const gpu = document.createElement('div');
        gpu.className = 'ui-perf-bar-item ui-perf-bar-gpu';
        gpu.textContent = 'GPU: N/A';

        left.appendChild(fps);
        left.appendChild(gpuMs);
        left.appendChild(render);
        left.appendChild(memory);
        left.appendChild(gpu);

        const right = document.createElement('div');
        right.className = 'ui-perf-bar-right';

        const btnToggle = document.createElement('button');
        btnToggle.className = 'ui-perf-bar-btn ui-perf-bar-toggle';
        btnToggle.type = 'button';
        const iconToggle = applyMaterialSymbolToButton(btnToggle, { name: 'visibility_off', label: 'Hide performance bar', size: 'sm' });
        btnToggle.removeAttribute('title');

        root.appendChild(left);
        root.appendChild(right);
        right.appendChild(btnToggle);

        const first = host.firstChild;
        if (first) host.insertBefore(root, first);
        else host.appendChild(root);

        const btnDockToggle = document.createElement('button');
        btnDockToggle.id = 'ui-perf-bar-dock-toggle';
        btnDockToggle.className = 'ui-perf-bar-dock-btn hidden';
        btnDockToggle.type = 'button';
        const iconDockToggle = applyMaterialSymbolToButton(btnDockToggle, { name: 'visibility', label: 'Show performance bar', size: 'sm' });
        btnDockToggle.removeAttribute('title');
        document.body.appendChild(btnDockToggle);

        this.root = root;
        this._els.fpsText = fps;
        this._els.gpuMsText = gpuMs;
        this._els.renderText = render;
        this._els.memoryText = memory;
        this._els.gpuText = gpu;
        this._els.btnToggle = btnToggle;
        this._els.iconToggle = iconToggle;
        this._els.btnDockToggle = btnDockToggle;
        this._els.iconDockToggle = iconDockToggle;

        btnToggle.addEventListener('click', () => this.setHidden(!this.isHidden()), { passive: true });
        btnDockToggle.addEventListener('click', () => this.setHidden(false), { passive: true });

        document.body.classList.add(GLOBAL_CLASS_ENABLED);
        this.setHidden(false);
        window.addEventListener('keydown', this._onDocKeyDown, { passive: false, capture: true });

        this._renderStatic();
        return root;
    }

    destroy() {
        if (!this.root) return;
        window.removeEventListener('keydown', this._onDocKeyDown, { capture: true });
        this.root.remove();
        this._els.btnDockToggle?.remove();
        this.root = null;
        this._renderer = null;
        this._rendererInfo = null;
    }

    isHidden() {
        return this._hidden;
    }

    setHidden(hidden) {
        const wantHidden = !!hidden;
        this._hidden = wantHidden;
        document.body.classList.toggle(GLOBAL_CLASS_HIDDEN, wantHidden);
        if (this.root) this.root.classList.toggle('hidden', wantHidden);
        this._els.btnDockToggle?.classList.toggle('hidden', !wantHidden);
        const iconMain = this._els.iconToggle;
        const iconDock = this._els.iconDockToggle;
        if (iconMain) iconMain.textContent = wantHidden ? 'visibility' : 'visibility_off';
        if (iconDock) iconDock.textContent = wantHidden ? 'visibility' : 'visibility_off';
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }

    setRenderer(renderer) {
        this._renderer = renderer ?? null;
        this._rendererInfo = this._renderer ? getRendererInfo(this._renderer) : null;
        this._gpuFrameTimer = this._renderer ? getOrCreateGpuFrameTimer(this._renderer) : null;
        this._renderStatic();
    }

    onFrame({ dt, nowMs, renderer } = {}) {
        const now = Number.isFinite(nowMs) ? nowMs : performance.now();
        if (renderer) this.setRenderer(renderer);

        let frameMs = 0;
        if (Number.isFinite(dt)) frameMs = Math.max(0, dt * 1000);
        else if (this._frame.lastNowMs) frameMs = Math.max(0, now - this._frame.lastNowMs);

        this._frame.lastNowMs = now;
        if (frameMs > 0.001) {
            const alpha = 0.08;
            this._frame.emaMs = this._frame.emaMs ? (this._frame.emaMs * (1 - alpha) + frameMs * alpha) : frameMs;
        }

        if (!this._forceUpdate && now - this._frame.lastUpdateMs < this._updateIntervalMs) return;
        this._forceUpdate = false;
        this._frame.lastUpdateMs = now;
        this._renderLive();
    }

    _renderStatic() {
        if (!this.root) return;
        const gpu = this._els.gpuText;
        if (!gpu) return;
        const label = this._rendererInfo ? formatRendererLabel(this._rendererInfo) : '';
        gpu.textContent = label ? `GPU: ${label}` : 'GPU: N/A';
    }

    _renderLive() {
        if (!this.root) return;

        const fpsEl = this._els.fpsText;
        const gpuMsEl = this._els.gpuMsText;
        const renderEl = this._els.renderText;
        const memoryEl = this._els.memoryText;
        if (!fpsEl || !gpuMsEl || !renderEl || !memoryEl) return;

        const ms = Number.isFinite(this._frame.emaMs) ? this._frame.emaMs : 0;
        const fps = ms > 1e-3 ? 1000 / ms : 0;
        const fpsLabel = fps > 0 ? Math.round(fps) : null;
        const msLabel = ms > 0 ? ms.toFixed(1) : null;

        fpsEl.textContent = fpsLabel !== null && msLabel !== null
            ? `FPS: ${fpsLabel} (${msLabel} ms)`
            : 'FPS: -- (-- ms)';

        const gpuMs = this._gpuFrameTimer?.getLastMs?.() ?? null;
        gpuMsEl.textContent = Number.isFinite(gpuMs)
            ? `GPUms: ${gpuMs.toFixed(1)}ms`
            : 'GPUms: N/A';

        const warn = fpsLabel !== null && fpsLabel < this._fpsWarnBelow;
        this.root.classList.toggle('is-warn', warn);

        const info = this._renderer?.info ?? null;
        const render = info?.render ?? null;
        const calls = render?.calls ?? null;
        const tris = render?.triangles ?? null;
        const lines = render?.lines ?? null;
        const points = render?.points ?? null;

        const callsText = Number.isFinite(calls) ? `${Math.round(calls)}` : 'N/A';
        const trisText = Number.isFinite(tris) ? formatCount(tris) : 'N/A';
        const linesText = Number.isFinite(lines) ? formatCount(lines) : 'N/A';
        const pointsText = Number.isFinite(points) ? formatCount(points) : 'N/A';
        renderEl.textContent = `Calls: ${callsText} · Tris: ${trisText} · Lines: ${linesText} · Pts: ${pointsText}`;

        const memory = info?.memory ?? null;
        const programs = Array.isArray(info?.programs) ? info.programs : null;
        const geoms = memory?.geometries ?? null;
        const tex = memory?.textures ?? null;

        const geomsText = Number.isFinite(geoms) ? `${Math.round(geoms)}` : 'N/A';
        const texText = Number.isFinite(tex) ? `${Math.round(tex)}` : 'N/A';
        const programsText = programs ? `${programs.length}` : 'N/A';
        memoryEl.textContent = `Geo: ${geomsText} · Tex: ${texText} · Progs: ${programsText}`;
    }
}

let _global = null;

export function ensureGlobalPerfBar() {
    if (_global) return _global;
    const bar = new PerfBar();
    bar.mount(document.body);
    _global = bar;
    return _global;
}
