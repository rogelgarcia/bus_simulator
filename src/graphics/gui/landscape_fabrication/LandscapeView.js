// Owns the landscape preview renderer, camera, and provisional inspection lifecycle.
// @ts-check
import * as THREE from 'three';
import { ToolCameraController } from '../../engine3d/camera/ToolCameraController.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { loadLandscapeOverview, createLandscapeSelectionContext } from '../../../app/landscape/index.js';
import { LandscapePanel } from './LandscapePanel.js';
import { createLandscapeMesh } from './LandscapeMesh.js';

const DEFAULT_SOURCE = '/assets/public/landscape/coastal-city/manifest.json';

export class LandscapeView {
    /** @param {HTMLCanvasElement} canvas @param {{source?: string}} options */
    constructor(canvas, { source = DEFAULT_SOURCE } = {}) {
        this.canvas = canvas;
        this.source = new URL(source, location.href).href;
        this.mode = 'shaded';
        this.selection = null;
        this.handoffQueue = Promise.resolve();
        this.disposed = false;
        this.frameIndex = 0;
        this.loadSequence = 0;
        this.abort = new AbortController();
        this.perfBar = ensureGlobalPerfBar();
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x263c4e);
        this.scene.add(new THREE.HemisphereLight(0xdceef4, 0x536047, 2.3));
        const sun = new THREE.DirectionalLight(0xfff4dd, 2.2);
        sun.position.set(-2000, 4000, -1000);
        this.scene.add(sun);
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 25000);
        this.camera.position.set(4400, 3000, -2300);
        this.panel = new LandscapePanel(action => this.action(action));
        this.controls = new ToolCameraController(this.camera, canvas, { uiRoot: this.panel.root, minDistance: 3, maxDistance: 18000, maxPolarAngle: Math.PI * .495 });
        this.controls.setLookAt({ position: this.camera.position, target: { x: 2000, y: 0, z: 2000 } });
        this.marker = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffeaa8, depthTest: false }));
        this.marker.renderOrder = 10;
        this.marker.visible = false;
        this.scene.add(this.marker);
        this.grid = new THREE.GridHelper(4000, 20, 0xc5d8d7, 0x819993);
        this.grid.position.set(2000, .4, 2000);
        this.grid.visible = false;
        this.scene.add(this.grid);
        this.axes = new THREE.AxesHelper(350);
        this.axes.visible = false;
        this.scene.add(this.axes);
        this.raycaster = new THREE.Raycaster();
        this.perfBar.setRenderer(this.renderer);
        this.gpuTimer = getOrCreateGpuFrameTimer(this.renderer);
        this.onPointerDown = event => { if (event.button === 0) this.pointerDown = { x: event.clientX, y: event.clientY }; };
        this.onPointerUp = event => {
            const start = this.pointerDown;
            this.pointerDown = null;
            if (event.button !== 0 || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
            this.pick(event.clientX, event.clientY);
        };
        canvas.addEventListener('pointerdown', this.onPointerDown, { signal: this.abort.signal });
        canvas.addEventListener('pointerup', this.onPointerUp, { signal: this.abort.signal });
        window.addEventListener('resize', () => this.resize(), { signal: this.abort.signal });
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas);
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); else this.resume(); }, { signal: this.abort.signal });
        this.resize();
        this.resume();
    }

    /** Reloads a validated overview without changing the current camera pose. */
    async load() {
        const sequence = ++this.loadSequence;
        this.loadAbort?.abort();
        this.loadAbort = new AbortController();
        this.panel.text('status', 'Loading and validating the coarse overview…');
        try {
            const loaded = await loadLandscapeOverview(this.source, { signal: this.loadAbort.signal });
            if (this.disposed || sequence !== this.loadSequence) return;
            const model = createLandscapeMesh(loaded.chunk, { catalog: loaded.manifest.landCover.catalog });
            model.setMode(this.mode);
            if (this.model) { this.scene.remove(this.model.mesh); this.model.dispose(); }
            this.loaded = loaded;
            this.lastError = null;
            this.model = model;
            this.scene.add(model.mesh);
            const { manifest, chunk } = loaded;
            this.panel.text('source', `${manifest.name} · ${(manifest.bounds.maxX - manifest.bounds.minX) / 1000} × ${(manifest.bounds.maxZ - manifest.bounds.minZ) / 1000} km`);
            this.panel.text('revision', `Revision ${manifest.revision} · ${chunk.descriptor.columns} × ${chunk.descriptor.rows} overview`);
            this.panel.text('status', `${model.diagnostics().triangles.toLocaleString()} triangles · Native terrain preserved separately · Y up / +Z north`);
            this.panel.text('legend', `SURFACE REFERENCE\n${manifest.landCover.catalog.map(item => `${item.id}  ${item.label}`).join('\n')}\n\nWorld grid: 200 m · Elevations: meters\nNative spacing: ${manifest.grid.spacingX.toFixed(3)} m`);
            this.panel.notice('');
            if (this.selection) this.select(this.selection.position.x, this.selection.position.z);
            this.perfBar.requestUpdate();
        } catch (error) {
            if (error.name === 'AbortError' || sequence !== this.loadSequence || this.disposed) return;
            this.panel.notice(`Landscape update rejected: ${error.message}. ${this.loaded ? 'The last valid revision remains visible.' : 'Check the prepared manifest and local server.'}`);
            this.panel.text('status', this.loaded ? `Showing last valid revision ${this.loaded.manifest.revision}` : 'No valid terrain loaded');
            this.lastError = error.message;
        }
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.renderer.setSize(Math.round(rect.width), Math.round(rect.height), false);
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
    }

    preset(name) {
        const presets = {
            home: { position: { x: 4400, y: 3000, z: -2300 }, target: { x: 2000, y: 0, z: 2000 } },
            top: { position: { x: 2000, y: 5800, z: 1999 }, target: { x: 2000, y: 0, z: 2000 } },
            ground: { position: { x: 970, y: 115, z: 240 }, target: { x: 1680, y: 14, z: 1100 } }
        };
        if (!presets[name]) throw new Error(`Unknown camera preset: ${name}`);
        this.controls.setLookAt(presets[name]);
        for (const id of Object.keys(presets)) this.panel.active(`camera:${id}`, id === name);
    }

    setMode(mode) {
        if (!['shaded', 'wireframe', 'combined'].includes(mode)) throw new Error(`Unknown inspection mode: ${mode}`);
        this.mode = mode;
        this.model?.setMode(mode);
        this.panel.mode(mode);
        this.perfBar.requestUpdate();
    }

    pick(clientX, clientY) {
        if (!this.model) return null;
        const rect = this.canvas.getBoundingClientRect();
        this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
        this.model.mesh.updateMatrixWorld();
        const hit = this.raycaster.intersectObject(this.model.mesh, false)[0];
        if (!hit) { this.clearSelection(); this.panel.text('selection', 'No terrain at this point.'); return null; }
        return this.select(hit.point.x, hit.point.z);
    }

    /** @param {number} x @param {number} z */
    select(x, z) {
        if (!this.loaded) return null;
        const context = createLandscapeSelectionContext(this.loaded.manifest, this.loaded.chunk, { x, z, selectionId: crypto.randomUUID(), camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray() } });
        this.selection = context;
        this.marker.position.set(context.position.x, context.position.y, context.position.z);
        this.marker.visible = true;
        const sample = context.sample ?? context;
        this.panel.text('selection-title', 'Selected terrain point');
        this.panel.text('selection', `X ${context.position.x.toFixed(2)} m\nY ${context.position.y.toFixed(3)} m\nZ ${context.position.z.toFixed(2)} m\nSoil: ${sample.soilId ?? context.soilId}\nCoarse preview · provisional`);
        this.saveSelection(context);
        return context;
    }

    async saveSelection(context) {
        this.panel.text('handoff', 'Saving selection context…');
        try {
            const save = async () => {
                const response = await fetch('/api/landscape/selection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(context), signal: this.abort.signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
            };
            this.handoffQueue = this.handoffQueue.then(save, save);
            await this.handoffQueue;
            if (this.selection === context) this.panel.text('handoff', 'Context saved for AI. This is a provisional overview sample.');
        } catch (error) {
            if (error.name !== 'AbortError' && this.selection === context) this.panel.text('handoff', 'Local handoff unavailable. Copy or download context, or use the landscape server on port 8002.');
        }
    }

    async clearSelection() {
        this.selection = null;
        this.marker.visible = false;
        this.panel.text('selection-title', 'Point to the terrain');
        this.panel.text('selection', 'Click a surface to identify its world coordinates and cover type.');
        this.panel.text('handoff', 'Selections are view-only. Terrain is unchanged.');
        const clear = async () => {
            const response = await fetch('/api/landscape/selection', { method: 'DELETE', signal: this.abort.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        };
        this.handoffQueue = this.handoffQueue.then(clear, clear);
        try { await this.handoffQueue; }
        catch (error) {
            if (error.name !== 'AbortError' && !this.selection) this.panel.text('handoff', 'The visible selection was cleared, but the local handoff could not be cleared.');
        }
    }

    async action(action) {
        if (action.startsWith('mode:')) return this.setMode(action.slice(5));
        if (action.startsWith('camera:')) return this.preset(action.slice(7));
        if (action === 'reload') return this.load();
        if (action === 'clear') return this.clearSelection();
        if (action === 'grid' || action === 'axes') {
            this[action].visible = !this[action].visible;
            this.panel.active(action, this[action].visible);
            return;
        }
        if (!this.selection) { this.panel.text('handoff', 'Select a terrain point first.'); return; }
        const json = JSON.stringify(this.selection, null, 2);
        if (action === 'copy') {
            try { await navigator.clipboard.writeText(json); this.panel.text('handoff', 'Selection context copied.'); }
            catch { this.panel.text('handoff', 'Clipboard unavailable. Use Download JSON.'); }
        } else if (action === 'download') {
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'landscape-selection.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }

    snapshot() {
        return {
            ready: !!this.loaded, disposed: this.disposed, mode: this.mode, revision: this.loaded?.manifest.revision,
            selection: this.selection, camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray() },
            source: this.source, lastError: this.lastError ?? null, frameIndex: this.frameIndex,
            helpers: { grid: this.grid.visible, axes: this.axes.visible },
            sourceBytes: this.loaded?.decodedBytes ?? 0, memory: this.model?.diagnostics() ?? null,
            renderer: { ...this.renderer.info.render, memory: { ...this.renderer.info.memory } },
            canvas: { width: this.canvas.width, height: this.canvas.height }
        };
    }

    resume() {
        if (this.disposed || this.frameRequest || document.hidden) return;
        this.lastFrame = performance.now();
        const frame = now => {
            this.frameRequest = null;
            if (this.disposed || document.hidden) return;
            const rawDt = (now - this.lastFrame) / 1000;
            this.lastFrame = now;
            this.controls.update(Math.min(rawDt, .1));
            if (this.marker.visible) this.marker.scale.setScalar(Math.max(.3, this.camera.position.distanceTo(this.marker.position) * .004));
            this.gpuTimer.poll();
            this.gpuTimer.beginFrame();
            this.renderer.render(this.scene, this.camera);
            this.gpuTimer.endFrame();
            this.perfBar.onFrame({ dt: Math.min(rawDt, .1), rawDt, nowMs: now, renderer: this.renderer, frameIndex: ++this.frameIndex });
            this.frameRequest = requestAnimationFrame(frame);
        };
        this.frameRequest = requestAnimationFrame(frame);
    }

    pause() { cancelAnimationFrame(this.frameRequest); this.frameRequest = null; }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.pause();
        this.loadAbort?.abort();
        this.abort.abort();
        this.resizeObserver.disconnect();
        this.controls.dispose();
        this.model?.dispose();
        this.model = null;
        this.gpuTimer.resetSamples();
        for (const helper of [this.grid, this.axes, this.marker]) {
            helper.geometry.dispose();
            if (Array.isArray(helper.material)) helper.material.forEach(material => material.dispose());
            else helper.material.dispose();
        }
        this.panel.dispose();
        this.perfBar.setRenderer(null);
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.scene.clear();
        this.loaded = null;
    }
}
