// Owns the landscape preview renderer, camera, and provisional inspection lifecycle.
// @ts-check
import * as THREE from 'three';
import { ToolCameraController } from '../../engine3d/camera/ToolCameraController.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { loadLandscapeOverview, createLandscapeSelectionContext, sampleLandscapeChunk, planLandscapeRegion, queryLandscapeSelection, LandscapeResidencyBudget, LANDSCAPE_STREAMING_BUDGETS } from '../../../app/landscape/index.js';
import { LandscapePanel } from './LandscapePanel.js';
import { LandscapeStreamer } from '../../engine3d/landscape/LandscapeStreamer.js';
import { LandscapeAppearanceStreamer } from '../../engine3d/landscape/LandscapeAppearanceStreamer.js';
import { createLandscapeWaterReference } from '../../engine3d/landscape/LandscapeWaterReference.js';

const DEFAULT_SOURCE = '/assets/public/landscape/coastal-city/manifest.json';

export class LandscapeView {
    /** @param {HTMLCanvasElement} canvas @param {{source?: string}} options */
    constructor(canvas, { source = DEFAULT_SOURCE, budgets = {} } = {}) {
        this.canvas = canvas;
        this.source = new URL(source, location.href).href;
        this.mode = 'shaded';
        this.projection = 'perspective';
        this.perspectiveFov = 50;
        this.orthoHeight = 5000;
        this.lodColors = false;
        this.boundaries = false;
        this.waterVisible = true;
        this.budget = new LandscapeResidencyBudget(budgets);
        this.consumerLeases = new Map();
        this.selection = null;
        this.selectionRadius = 25;
        this.selectionSequence = 0;
        this.handoffQueue = Promise.resolve();
        this.disposed = false;
        this.frameIndex = 0;
        this.peakUploadedBytes = 0;
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
        this.panel = new LandscapePanel(action => Promise.resolve(this.action(action)).catch(error => this.panel.notice(error.message)));
        this.panel.active('water', true);
        this.controls = new ToolCameraController(this.camera, canvas, { uiRoot: this.panel.root, minDistance: 3, maxDistance: 18000, maxPolarAngle: Math.PI * .495 });
        this.controls.setLookAt({ position: this.camera.position, target: { x: 2000, y: 0, z: 2000 } });
        canvas.addEventListener('wheel', event => {
            if (!this.camera.isOrthographicCamera) return;
            this.camera.zoom = Math.max(.1, Math.min(100, this.camera.zoom * Math.exp(-event.deltaY * .001)));
            this.camera.updateProjectionMatrix();
            this.panel.root.querySelector('[data-field="zoom"]').value = String(this.camera.zoom.toFixed(2));
            event.preventDefault();
            event.stopImmediatePropagation();
        }, { signal: this.abort.signal, passive: false, capture: true });
        this.marker = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffeaa8, depthTest: false }));
        this.marker.renderOrder = 10;
        this.marker.visible = false;
        this.scene.add(this.marker);
        this.selectionOutline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffeaa8, depthTest: false }));
        this.selectionOutline.renderOrder = 9;
        this.selectionOutline.visible = false;
        this.scene.add(this.selectionOutline);
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
        this.selectionAbort?.abort();
        this.loadingStream?.dispose();
        this.loadingStream = null;
        this.loadingAppearance?.dispose();
        this.loadingAppearance = null;
        this.appearance?.coarsenForReload();
        this.stream?.coarsenToRoot();
        this.loadAbort = new AbortController();
        this.reloading = true;
        this.panel.text('status', 'Loading and validating the coarse overview…');
        const loadKey = `overview-load/${sequence}`;
        const reservation = this.budget.reserve(loadKey, { cpuBytes: 3 * 1024 * 1024, gpuBytes: 0, kind: 'manifest-overview-decode' });
        if (!reservation.admitted) { this.reloading = false; this.panel.notice(`Landscape reload cannot fit: ${reservation.reason}`); this.lastError = reservation.reason; return; }
        try {
            const loaded = await loadLandscapeOverview(this.source, { signal: this.loadAbort.signal });
            if (this.disposed || sequence !== this.loadSequence) return;
            const stream = new LandscapeStreamer({ loaded, budget: this.budget, renderer: this.renderer, scene: this.scene, mode: this.mode, lodColors: this.lodColors, boundaries: this.boundaries });
            this.loadingStream = stream;
            await stream.initialize(this.camera);
            if (this.disposed || sequence !== this.loadSequence) { stream.dispose(); return; }
            this.stream?.dispose();
            this.appearance?.dispose();
            this.water?.dispose();
            this.loaded = loaded;
            this.lastError = null;
            this.stream = stream;
            this.loadingStream = null;
            const appearance = new LandscapeAppearanceStreamer({ loaded, budget: this.budget, renderer: this.renderer });
            this.appearance = this.loadingAppearance = appearance;
            stream.setAppearance(appearance);
            this.water = createLandscapeWaterReference({ manifest: loaded.manifest, budget: this.budget, scene: this.scene, visible: this.waterVisible });
            await appearance.initialize();
            if (this.disposed || sequence !== this.loadSequence) return;
            this.loadingAppearance = null;
            const { manifest, chunk } = loaded;
            this.panel.text('source', `${manifest.name} · ${(manifest.bounds.maxX - manifest.bounds.minX) / 1000} × ${(manifest.bounds.maxZ - manifest.bounds.minZ) / 1000} km`);
            this.panel.text('revision', `Revision ${manifest.revision} · ${manifest.chunks.length} prepared tiles · Native level ${manifest.grid.maxLevel}`);
            this.panel.text('status', 'Worker streaming ready · Soil PBR + independent masks · Y up / +Z north · Native queries independent of appearance');
            this.panel.text('legend', `SURFACE REFERENCE\n${manifest.landCover.catalog.map(item => `${item.id}  ${item.label}`).join('\n')}\n\nPavement tint: planning reference over unknown soil\nWater: separate sea-level reference\nWorld grid: 200 m · Elevations: meters\nNative spacing: ${manifest.grid.spacingX.toFixed(3)} m`);
            this.panel.notice('');
            if (this.selection) this.select(this.selection.position.x, this.selection.position.z);
            this.perfBar.requestUpdate();
        } catch (error) {
            if (error.name === 'AbortError' || sequence !== this.loadSequence || this.disposed) return;
            this.panel.notice(`Landscape update rejected: ${error.message}. ${this.loaded ? 'The last valid revision remains visible.' : 'Check the prepared manifest and local server.'}`);
            this.panel.text('status', this.loaded ? `Showing last valid revision ${this.loaded.manifest.revision}` : 'No valid terrain loaded');
            this.lastError = error.message;
        } finally {
            this.budget.release(loadKey);
            if (sequence === this.loadSequence) this.reloading = false;
        }
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.renderer.setSize(Math.round(rect.width), Math.round(rect.height), false);
        if (this.camera.isOrthographicCamera) {
            this.camera.top = this.orthoHeight / 2;
            this.camera.bottom = -this.orthoHeight / 2;
            this.camera.left = -this.orthoHeight * rect.width / rect.height / 2;
            this.camera.right = -this.camera.left;
        } else this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
    }

    setCamera({ position, target, projection = this.projection, fov = this.perspectiveFov, orthoHeight = this.orthoHeight, zoom } = {}) {
        if (!['perspective', 'orthographic'].includes(projection) || !Number.isFinite(fov) || fov < 5 || fov > 110 || !Number.isFinite(orthoHeight) || orthoHeight < 20 || orthoHeight > 20000 || (zoom !== undefined && (!Number.isFinite(zoom) || zoom < .1 || zoom > 100))) throw new Error('Invalid terrain camera projection or zoom');
        this.perspectiveFov = fov;
        this.orthoHeight = orthoHeight;
        if (projection !== this.projection) {
            const previous = this.camera;
            this.camera = projection === 'orthographic' ? new THREE.OrthographicCamera(-2500, 2500, 2500, -2500, .5, 25000) : new THREE.PerspectiveCamera(fov, previous.aspect ?? 1, .5, 25000);
            this.camera.position.copy(previous.position);
            this.camera.quaternion.copy(previous.quaternion);
            this.controls.camera = this.camera;
            this.controls.syncFromCamera();
            this.projection = projection;
        }
        if (this.camera.isPerspectiveCamera) this.camera.fov = fov;
        if (zoom !== undefined) this.camera.zoom = zoom;
        const toPoint = value => Array.isArray(value) ? { x: value[0], y: value[1], z: value[2] } : value;
        if (position || target) this.controls.setLookAt({ position: toPoint(position), target: toPoint(target) });
        this.resize();
        this.panel.root.querySelector('[data-field="projection"]').value = projection;
        this.panel.root.querySelector('[data-field="fov"]').value = String(fov);
        this.panel.root.querySelector('[data-field="span"]').value = String(orthoHeight);
        this.panel.root.querySelector('[data-field="zoom"]').value = String(this.camera.zoom);
    }

    setInspection({ lod = this.lodColors, boundaries = this.boundaries } = {}) {
        this.stream?.setInspection({ lod, boundaries });
        this.lodColors = lod;
        this.boundaries = boundaries;
        this.panel.active('lod', lod);
        this.panel.active('boundaries', boundaries);
    }

    setWater(visible) {
        if (typeof visible !== 'boolean') throw new Error('Water visibility must be boolean');
        this.waterVisible = visible;
        this.water?.setVisible(visible);
        this.panel.active('water', visible);
    }

    async setBudgets(budgets) {
        this.loadSequence++;
        this.loadAbort?.abort();
        this.loadingStream?.dispose();
        this.loadingStream = null;
        this.loadingAppearance?.dispose();
        this.loadingAppearance = null;
        this.appearance?.dispose();
        this.appearance = null;
        this.water?.dispose();
        this.water = null;
        this.selectionAbort?.abort();
        for (const lease of this.consumerLeases.values()) lease.release();
        this.consumerLeases.clear();
        this.stream?.dispose();
        this.stream = null;
        this.loaded = null;
        this.budget.dispose();
        this.budget = new LandscapeResidencyBudget(budgets);
        return this.load();
    }

    async acquireConsumer(ids, options = {}) {
        const consumer = options.consumer ?? `test-consumer-${crypto.randomUUID()}`;
        if (this.consumerLeases.has(consumer)) throw new Error(`Consumer ${consumer} already has a lease`);
        const lease = await this.stream.acquireChunks(ids, { ...options, consumer });
        this.consumerLeases.set(consumer, lease);
        return { consumer, chunkIds: lease.chunkIds };
    }

    releaseConsumer(consumer) { this.consumerLeases.get(consumer)?.release(); this.consumerLeases.delete(consumer); }

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
        this.stream?.setInspection({ mode });
        this.mode = mode;
        this.panel.mode(mode);
        this.perfBar.requestUpdate();
    }

    pick(clientX, clientY) {
        if (!this.stream) return null;
        const rect = this.canvas.getBoundingClientRect();
        this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
        const meshes = this.stream.renderedMeshes();
        for (const mesh of meshes) mesh.updateMatrixWorld();
        const hit = this.raycaster.intersectObjects(meshes, false)[0];
        if (!hit) { this.clearSelection(); this.panel.text('selection', 'No terrain at this point.'); return null; }
        return this.select(hit.point.x, hit.point.z);
    }

    /** @param {number} x @param {number} z */
    async select(x, z) {
        if (!this.loaded) return null;
        const sequence = ++this.selectionSequence;
        this.selectionAbort?.abort();
        this.selectionAbort = new AbortController();
        const options = { x, z, selectionId: crypto.randomUUID(), ...(this.selectionRadius > 0 ? { radius: this.selectionRadius } : {}), camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray() } };
        let context;
        try { context = createLandscapeSelectionContext(this.loaded.manifest, this.loaded.chunk, options); }
        catch (error) { await this.clearSelection(); this.panel.notice(error.message); return null; }
        try {
            this.showSelection(context);
            this.saveSelection(context);
            this.panel.text('selection-title', 'Resolving native terrain…');
            const manifest = this.loaded.manifest;
            const plan = planLandscapeRegion(manifest, context.region);
            const lease = await this.stream.acquireChunks(plan.chunkIds, { consumer: `selection/${options.selectionId}`, priority: 100, accuracy: 'authoritative', signal: this.selectionAbort.signal });
            let resolved;
            try { resolved = await queryLandscapeSelection(manifest, { ...options, expectedRevision: manifest.revision }, { readChunk: lease.readChunk, signal: this.selectionAbort.signal }); }
            finally { lease.release(); }
            if (this.disposed || sequence !== this.selectionSequence) return null;
            if (resolved.sourceRevision !== this.loaded.manifest.revision || resolved.provisional || !resolved.editingReady) throw new Error('Native selection did not resolve against the displayed revision');
            this.showSelection(resolved);
            await this.saveSelection(resolved);
            return resolved;
        } catch (error) {
            if (error.name === 'AbortError' || sequence !== this.selectionSequence || this.disposed) return null;
            this.panel.text('selection-title', 'Selection needs attention');
            this.panel.text('handoff', `Exact selection unavailable: ${error.message}`);
            this.panel.notice(error.message);
            return null;
        }
    }

    showSelection(context) {
        this.selection = context;
        this.marker.position.set(context.position.x, context.position.y, context.position.z);
        this.marker.visible = true;
        this.selectionOutline.geometry.dispose();
        this.selectionOutline.geometry = new THREE.BufferGeometry();
        this.selectionOutline.visible = context.region.type === 'circle';
        if (this.selectionOutline.visible) {
            const points = [];
            for (let i = 0; i < 72; i++) {
                const angle = i / 72 * Math.PI * 2;
                const x = context.position.x + Math.cos(angle) * context.region.radius;
                const z = context.position.z + Math.sin(angle) * context.region.radius;
                const sample = sampleLandscapeChunk(this.loaded.manifest, this.stream?.renderedChunkAt(x, z) ?? this.loaded.chunk, x, z);
                points.push(new THREE.Vector3(x, sample.height + .2, z));
            }
            this.selectionOutline.geometry.setFromPoints(points);
        }
        const { sample } = context;
        this.panel.text('selection-title', context.provisional ? 'Provisional terrain point' : 'Native terrain selection');
        this.panel.text('selection', `X ${context.position.x.toFixed(2)} m\nY ${context.position.y.toFixed(3)} m\nZ ${context.position.z.toFixed(2)} m\nSoil: ${sample.soilId}\nSlope: ${sample.slopeDegrees.toFixed(2)}°\n${context.region.type === 'circle' ? `Radius: ${context.region.radius} m\n` : ''}${context.provisional ? 'Coarse preview · provisional' : `Authoritative · ${sample.sampleSpacing.x.toFixed(3)} m spacing`}`);
        this.panel.notice('');
    }

    setSelectionRadius(value) {
        if (!Number.isFinite(value) || value < 0 || value > 1000) { this.panel.notice('Selection radius must be between 0 and 1000 meters.'); return; }
        this.selectionRadius = value;
        this.panel.root.querySelector('[data-field="radius"]').value = String(value);
        if (this.selection) return this.select(this.selection.position.x, this.selection.position.z);
    }

    focusSelection() {
        if (!this.selection) return;
        const { x, y, z } = this.selection.position;
        const distance = Math.max(30, this.selectionRadius * 2.4);
        this.controls.setLookAt({ position: { x: x + distance, y: y + distance * .8, z: z - distance }, target: { x, y, z } });
        for (const id of ['home', 'top', 'ground']) this.panel.active(`camera:${id}`, false);
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
            if (this.selection === context) this.panel.text('handoff', context.provisional ? 'Provisional context saved for AI. Resolve native terrain before editing.' : 'Native context saved for AI. Ready for a revision-targeted edit.');
        } catch (error) {
            if (error.name !== 'AbortError' && this.selection === context) this.panel.text('handoff', 'Local handoff unavailable. Copy or download context, or use the landscape server on port 8002.');
        }
    }

    async clearSelection() {
        this.selectionSequence++;
        this.selectionAbort?.abort();
        this.selection = null;
        this.marker.visible = false;
        this.selectionOutline.visible = false;
        this.selectionOutline.geometry.dispose();
        this.selectionOutline.geometry = new THREE.BufferGeometry();
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
        if (action === 'projection') return this.setCamera({ projection: this.panel.root.querySelector('[data-field="projection"]').value });
        if (action === 'fov') return this.setCamera({ fov: Number(this.panel.root.querySelector('[data-field="fov"]').value) });
        if (action === 'span') return this.setCamera({ orthoHeight: Number(this.panel.root.querySelector('[data-field="span"]').value) });
        if (action === 'zoom') return this.setCamera({ zoom: Number(this.panel.root.querySelector('[data-field="zoom"]').value) });
        if (action === 'lod') return this.setInspection({ lod: !this.lodColors });
        if (action === 'boundaries') return this.setInspection({ boundaries: !this.boundaries });
        if (action === 'water') return this.setWater(!this.waterVisible);
        if (action === 'focus-selection') return this.focusSelection();
        if (action === 'selection:radius') return this.setSelectionRadius(Number(this.panel.root.querySelector('[data-field="radius"]').value));
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
            selection: this.selection, camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray(), projection: this.projection, fov: this.perspectiveFov, orthoHeight: this.orthoHeight, zoom: this.camera.zoom },
            source: this.source, lastError: this.lastError ?? null, frameIndex: this.frameIndex,
            helpers: { grid: this.grid.visible, axes: this.axes.visible },
            sourceBytes: this.stream?.snapshot().sourceBytes ?? 0, memory: this.stream?.snapshot() ?? null,
            streaming: this.stream?.snapshot() ?? null, budget: this.budget.snapshot(),
            appearance: this.appearance?.snapshot() ?? null, water: this.water?.snapshot() ?? { visible: false, seaLevel: null },
            uploadedBytesPerFrame: (this.stream?.snapshot().uploadedBytesPerFrame ?? 0) + (this.appearance?.snapshot().uploadedBytesPerFrame ?? 0),
            peakUploadedBytesPerFrame: this.peakUploadedBytes,
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
            if (this.camera.isOrthographicCamera) this.camera.fov = 2 * Math.atan(this.orthoHeight / this.camera.zoom / (2 * this.camera.position.distanceTo(this.controls.target))) * 180 / Math.PI;
            if (!this.reloading) {
                this.stream?.update(rawDt, this.camera, this.canvas.height);
                const geometryStats = this.stream?.snapshot();
                this.appearance?.update(rawDt, this.camera, this.canvas.height, Math.max(0, (geometryStats?.uploadLimitBytes ?? LANDSCAPE_STREAMING_BUDGETS.uploadBytesPerFrame) - (geometryStats?.uploadedBytesPerFrame ?? 0)));
                this.peakUploadedBytes = Math.max(this.peakUploadedBytes, (geometryStats?.uploadedBytesPerFrame ?? 0) + (this.appearance?.uploadedBytes ?? 0));
            }
            if (this.stream && (!this.lastTelemetryUpdate || now - this.lastTelemetryUpdate > 250)) {
                const stats = this.stream.snapshot();
                const mib = bytes => (bytes / (1024 * 1024)).toFixed(1);
                const errorBound = stats.achievedErrorPixels >= 10000 ? stats.achievedErrorPixels.toExponential(1) : stats.achievedErrorPixels.toFixed(2);
                const levels = stats.lods.map(lod => lod.level);
                this.panel.text('streaming', `LOD ${Math.min(...levels)}–${Math.max(...levels)} · ${stats.residentLeafIds.length} tiles · ${stats.pending} pending · CPU ${mib(stats.budget.cpuBytes)}/${mib(stats.budget.limits.cpuBytes)} MiB · GPU est. ${mib(stats.budget.gpuBytes)}/${mib(stats.budget.limits.gpuBytes)} MiB · error bound ${errorBound}/${stats.targetErrorPixels.toFixed(1)} px · ${stats.degradationReason ?? 'ready'}`);
                this.panel.text('streaming-detail', `Loaded ${stats.loaded} · evicted ${stats.evicted} · canceled ${stats.canceled} · queue ${stats.queueDepth} · upload ${mib(stats.uploadedBytesPerFrame)} MiB/frame · stream ${stats.frameCostMs.toFixed(2)} ms`);
                const appearance = this.appearance?.snapshot();
                if (appearance) this.panel.text('appearance', `Appearance: ${appearance.residentMaskIds.length}/${appearance.maskCapacity} mask pages · ${appearance.materials.map(value => `${value.soilId}:${value.resolution}`).join(' / ')} px · ${appearance.pending} pending · CPU ${mib(appearance.cpuBytes)} / GPU est. ${mib(appearance.gpuBytes)} MiB · ${appearance.degradationReason ?? (appearance.settled ? 'ready' : 'streaming')}`);
                if (this.selection) {
                    const x = this.selection.position.x, z = this.selection.position.z;
                    const chunk = this.stream.renderedChunkAt(x, z);
                    const lod = stats.lods.find(value => value.id === chunk?.descriptor.id);
                    this.panel.text('chunk', lod ? `${lod.id} · rendered / resident\nLOD ${lod.level} · error ${lod.errorPixels?.toFixed(2) ?? '—'} px\nSource error ≤ ${lod.geometricError.toFixed(3)} m` : 'Selected point is outside rendered terrain');
                }
                this.lastTelemetryUpdate = now;
            }
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
        this.selectionAbort?.abort();
        this.abort.abort();
        this.resizeObserver.disconnect();
        this.controls.dispose();
        this.loadingStream?.dispose();
        this.loadingAppearance?.dispose();
        this.appearance?.dispose();
        this.appearance = null;
        this.water?.dispose();
        this.water = null;
        this.stream?.dispose();
        this.stream = null;
        this.consumerLeases.clear();
        this.gpuTimer.resetSamples();
        for (const helper of [this.grid, this.axes, this.marker, this.selectionOutline]) {
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
