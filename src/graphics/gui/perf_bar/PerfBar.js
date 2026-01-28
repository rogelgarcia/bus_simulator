// src/graphics/gui/perf_bar/PerfBar.js
// Global performance/status bar UI.
// @ts-check

import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

const GLOBAL_CLASS_ENABLED = 'perf-bar-enabled';
const GLOBAL_CLASS_HIDDEN = 'perf-bar-hidden';
const STORAGE_KEY = 'bus_sim_perf_bar_v1';

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

function safeStorageGet(key) {
    try {
        return window?.localStorage?.getItem?.(key) ?? null;
    } catch {
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        window?.localStorage?.setItem?.(key, value);
    } catch {
    }
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

function formatRendererLabel(info) {
    const i = info && typeof info === 'object' ? info : null;
    const api = typeof i?.api === 'string' && i.api ? i.api : 'WebGL';
    const renderer = typeof i?.renderer === 'string' && i.renderer ? i.renderer : '';
    const vendor = typeof i?.vendor === 'string' && i.vendor ? i.vendor : '';

    const parts = [];
    parts.push(api);
    if (renderer) parts.push(renderer);
    else if (vendor) parts.push(vendor);
    return parts.join(' · ');
}

export class PerfBar {
    constructor({
        storageKey = STORAGE_KEY,
        fpsWarnBelow = 30,
        updateIntervalMs = 250
    } = {}) {
        this._storageKey = typeof storageKey === 'string' && storageKey.trim() ? storageKey.trim() : STORAGE_KEY;
        this._fpsWarnBelow = clamp(fpsWarnBelow, 5, 240, 30);
        this._updateIntervalMs = clamp(updateIntervalMs, 50, 2000, 250);

        this.root = null;
        this._detailOpen = false;

        this._renderer = null;
        this._rendererInfo = null;

        this._frame = {
            lastNowMs: 0,
            emaMs: 0,
            lastUpdateMs: 0
        };

        this._els = {
            fpsText: null,
            statsText: null,
            gpuText: null,
            details: null,
            detailsBody: null,
            btnDetails: null,
            btnHide: null
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

        const fps = document.createElement('div');
        fps.className = 'ui-perf-bar-item ui-perf-bar-fps';
        fps.textContent = 'FPS: -- (-- ms)';

        const stats = document.createElement('div');
        stats.className = 'ui-perf-bar-item ui-perf-bar-stats';
        stats.textContent = 'Calls: -- · Tris: --';

        left.appendChild(fps);
        left.appendChild(stats);

        const right = document.createElement('div');
        right.className = 'ui-perf-bar-right';

        const gpu = document.createElement('div');
        gpu.className = 'ui-perf-bar-item ui-perf-bar-gpu';
        gpu.textContent = 'GPU: N/A';

        const btnDetails = document.createElement('button');
        btnDetails.className = 'ui-perf-bar-btn';
        btnDetails.type = 'button';
        applyMaterialSymbolToButton(btnDetails, { name: 'expand_more', label: 'Toggle details', size: 'sm' });

        const btnHide = document.createElement('button');
        btnHide.className = 'ui-perf-bar-btn';
        btnHide.type = 'button';
        applyMaterialSymbolToButton(btnHide, { name: 'visibility_off', label: 'Hide bar (Ctrl+Shift+P to toggle)', size: 'sm' });

        right.appendChild(gpu);
        right.appendChild(btnDetails);
        right.appendChild(btnHide);

        const details = document.createElement('div');
        details.className = 'ui-perf-bar-details hidden';

        const detailsHeader = document.createElement('div');
        detailsHeader.className = 'ui-perf-bar-details-header';
        detailsHeader.textContent = 'Performance details';

        const detailsBody = document.createElement('div');
        detailsBody.className = 'ui-perf-bar-details-body';

        details.appendChild(detailsHeader);
        details.appendChild(detailsBody);

        root.appendChild(left);
        root.appendChild(right);
        root.appendChild(details);

        const first = host.firstChild;
        if (first) host.insertBefore(root, first);
        else host.appendChild(root);

        this.root = root;
        this._els.fpsText = fps;
        this._els.statsText = stats;
        this._els.gpuText = gpu;
        this._els.details = details;
        this._els.detailsBody = detailsBody;
        this._els.btnDetails = btnDetails;
        this._els.btnHide = btnHide;

        btnDetails.addEventListener('click', () => this.setDetailsOpen(!this._detailOpen), { passive: true });
        btnHide.addEventListener('click', () => this.setHidden(true), { passive: true });

        document.body.classList.add(GLOBAL_CLASS_ENABLED);
        this.setHidden(this.isHidden());
        window.addEventListener('keydown', this._onDocKeyDown, { passive: false, capture: true });

        this._renderStatic();
        return root;
    }

    destroy() {
        if (!this.root) return;
        window.removeEventListener('keydown', this._onDocKeyDown, { capture: true });
        this.root.remove();
        this.root = null;
        this._renderer = null;
        this._rendererInfo = null;
    }

    isHidden() {
        const raw = safeStorageGet(this._storageKey);
        if (!raw) return false;
        const v = String(raw).trim().toLowerCase();
        return v === '0' || v === 'false' || v === 'no' || v === 'off' ? false : v === 'hidden';
    }

    setHidden(hidden) {
        const wantHidden = !!hidden;
        safeStorageSet(this._storageKey, wantHidden ? 'hidden' : 'visible');
        document.body.classList.toggle(GLOBAL_CLASS_HIDDEN, wantHidden);
        if (this.root) this.root.classList.toggle('hidden', wantHidden);
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }

    setDetailsOpen(open) {
        const want = !!open;
        this._detailOpen = want;
        const btn = this._els.btnDetails;
        if (btn) {
            const icon = btn.querySelector('.ui-icon');
            if (icon) icon.classList.toggle('is-active', want);
        }
        this._els.details?.classList.toggle('hidden', !want);
        if (want) this._renderDetails();
    }

    setRenderer(renderer) {
        this._renderer = renderer ?? null;
        this._rendererInfo = this._renderer ? getRendererInfo(this._renderer) : null;
        this._renderStatic();
        if (this._detailOpen) this._renderDetails();
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

        if (now - this._frame.lastUpdateMs < this._updateIntervalMs) return;
        this._frame.lastUpdateMs = now;
        this._renderLive();
        if (this._detailOpen) this._renderDetails();
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
        const statsEl = this._els.statsText;
        if (!fpsEl || !statsEl) return;

        const ms = Number.isFinite(this._frame.emaMs) ? this._frame.emaMs : 0;
        const fps = ms > 1e-3 ? 1000 / ms : 0;
        const fpsLabel = fps > 0 ? Math.round(fps) : null;
        const msLabel = ms > 0 ? ms.toFixed(1) : null;

        fpsEl.textContent = fpsLabel !== null && msLabel !== null
            ? `FPS: ${fpsLabel} (${msLabel} ms)`
            : 'FPS: -- (-- ms)';

        const warn = fpsLabel !== null && fpsLabel < this._fpsWarnBelow;
        this.root.classList.toggle('is-warn', warn);

        const info = this._renderer?.info ?? null;
        const render = info?.render ?? null;
        const calls = render?.calls ?? null;
        const tris = render?.triangles ?? null;

        const callsText = Number.isFinite(calls) ? `${Math.round(calls)}` : 'N/A';
        const trisText = Number.isFinite(tris) ? formatCount(tris) : 'N/A';
        statsEl.textContent = `Calls: ${callsText} · Tris: ${trisText}`;
    }

    _renderDetails() {
        const body = this._els.detailsBody;
        if (!body) return;

        const info = this._renderer?.info ?? null;
        const render = info?.render ?? null;
        const memory = info?.memory ?? null;
        const programs = Array.isArray(info?.programs) ? info.programs : null;

        const calls = render?.calls;
        const tris = render?.triangles;
        const lines = render?.lines;
        const points = render?.points;

        const geoms = memory?.geometries;
        const tex = memory?.textures;

        const list = [
            { k: 'FPS avg', v: this._frame.emaMs ? `${Math.round(1000 / this._frame.emaMs)} (${this._frame.emaMs.toFixed(1)} ms)` : 'N/A' },
            { k: 'Draw calls', v: Number.isFinite(calls) ? `${Math.round(calls)}` : 'N/A' },
            { k: 'Triangles', v: Number.isFinite(tris) ? `${formatCount(tris)}` : 'N/A' },
            { k: 'Lines', v: Number.isFinite(lines) ? `${formatCount(lines)}` : 'N/A' },
            { k: 'Points', v: Number.isFinite(points) ? `${formatCount(points)}` : 'N/A' },
            { k: 'Geometries', v: Number.isFinite(geoms) ? `${Math.round(geoms)}` : 'N/A' },
            { k: 'Textures', v: Number.isFinite(tex) ? `${Math.round(tex)}` : 'N/A' },
            { k: 'Programs', v: programs ? `${programs.length}` : 'N/A' },
            { k: 'Renderer', v: this._rendererInfo ? formatRendererLabel(this._rendererInfo) : 'N/A' },
            { k: 'Version', v: typeof this._rendererInfo?.version === 'string' && this._rendererInfo.version ? this._rendererInfo.version : 'N/A' }
        ];

        body.textContent = '';
        for (const row of list) {
            const div = document.createElement('div');
            div.className = 'ui-perf-bar-details-row';
            const k = document.createElement('div');
            k.className = 'ui-perf-bar-details-key';
            k.textContent = row.k;
            const v = document.createElement('div');
            v.className = 'ui-perf-bar-details-value';
            v.textContent = row.v;
            div.appendChild(k);
            div.appendChild(v);
            body.appendChild(div);
        }
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
