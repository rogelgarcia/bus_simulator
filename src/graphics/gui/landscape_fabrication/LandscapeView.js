// Owns the landscape preview renderer, camera, and provisional inspection lifecycle.
// @ts-check
import * as THREE from 'three';
import { LandscapeCameraController } from './LandscapeCameraController.js';
import { LANDSCAPE_NAVIGATION } from './LandscapeNavigationState.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { loadLandscapeOverview, createLandscapeSelectionContext, sampleLandscapeChunk, planLandscapeRegion, queryLandscapeSelection, LandscapeResidencyBudget, LANDSCAPE_STREAMING_BUDGETS } from '../../../app/landscape/index.js';
import { LandscapePanel } from './LandscapePanel.js';
import { LandscapeStreamer } from '../../engine3d/landscape/LandscapeStreamer.js';
import { LandscapeAppearanceStreamer } from '../../engine3d/landscape/LandscapeAppearanceStreamer.js';
import { createLandscapeWaterReference } from '../../engine3d/landscape/LandscapeWaterReference.js';
import { LandscapePlanningOverlay } from '../../engine3d/landscape/LandscapePlanningOverlay.js';
import { landscapePlanningHeight } from '../../engine3d/landscape/LandscapePlanningGeometry.js';
import { chooseLandscapeCoverageSlots } from '../../engine3d/landscape/LandscapeAppearanceUniforms.js';
import { LANDSCAPE_SURFACE_LEVEL_COLORS, LANDSCAPE_SURFACE_SOIL_COLORS } from '../../engine3d/landscape/LandscapeTerrainDiagnostics.js';
import { LandscapeSurfaceDetailCache, landscapeSurfaceDetailCacheCapacity } from '../../engine3d/landscape/LandscapeSurfaceDetailCache.js';
import { landscapeCoverageMaskLayout } from '../../engine3d/landscape/LandscapeSurfaceCoverage.js';
import { LandscapeBookmarks } from './LandscapeBookmarks.js';
import { LandscapePerformanceCapture } from './LandscapePerformanceCapture.js';
import { readLandscapeTerrainReport } from '../../../app/landscape/LandscapeTerrainReports.js';

const DEFAULT_SOURCE = '/assets/public/landscape/coastal-city/manifest.json';

/** Generated surface-detail modes: levels below the native cover grid (25 cm reaches 0.244 m samples on the coast). */
export const LANDSCAPE_SURFACE_DETAIL_MODES = Object.freeze({ off: 0, '50cm': 2, '25cm': 3 });

export class LandscapeView {
    /** @param {HTMLCanvasElement} canvas @param {{source?:string,budgets?:{cpuBytes?:number,gpuBytes?:number},surfaceDetail?:'off'|'50cm'|'25cm'}} options */
    constructor(canvas, { source = DEFAULT_SOURCE, budgets = {}, surfaceDetail = '25cm' } = {}) {
        if (!Object.hasOwn(LANDSCAPE_SURFACE_DETAIL_MODES, surfaceDetail)) throw new Error(`[Landscape] surfaceDetail must be one of ${Object.keys(LANDSCAPE_SURFACE_DETAIL_MODES).join(', ')}; received ${surfaceDetail}`);
        this.canvas = canvas;
        this.surfaceDetail = surfaceDetail;
        this.surfaceDetailLevels = LANDSCAPE_SURFACE_DETAIL_MODES[surfaceDetail];
        this.detailCache = null;
        this.source = new URL(source, location.href).href;
        this.mode = 'shaded';
        this.projection = 'perspective';
        this.perspectiveFov = LANDSCAPE_NAVIGATION.fov;
        this.orthoHeight = 5000;
        this.lodColors = false;
        this.boundaries = false;
        this.waterVisible = true;
        this.planningVisibility = { districts: false, roads: false, shoreline: false, points: false, corridors: false };
        this.diagnostic = 'none';
        this.report = { status: 'idle', pending: false, result: null, error: null };
        this.reportSequence = 0;
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
        this.coverageSlots = chooseLandscapeCoverageSlots(this.renderer);
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
        this.camera = new THREE.PerspectiveCamera(this.perspectiveFov, 1, 0.1, 25000);
        this.camera.position.set(4400, 3000, -2300);
        this.panel = new LandscapePanel(action => Promise.resolve(this.action(action)).catch(error => this.panel.notice(error.message)));
        this.panel.active('water', true);
        this.controls = new LandscapeCameraController(this.camera, canvas, { uiRoot: this.panel.root,
            onClick: event => this.pick(event.clientX, event.clientY), onNavigate: () => this.cancelCameraRequest(),
            onZoom: () => { this.panel.root.querySelector('[data-field="zoom"]').value = String(this.camera.zoom.toFixed(2)); } });
        this.controls.setLookAt({ position: this.camera.position, target: { x: 2000, y: 0, z: 2000 } });
        this.controls.setHomeFromCurrent();
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
        window.addEventListener('resize', () => this.resize(), { signal: this.abort.signal });
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas);
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); else this.resume(); }, { signal: this.abort.signal });
        this.resize();
        this.resume();
    }

    /** Reloads a validated overview without changing the current camera pose. */
    async load() {
        this.cancelCameraRequest();
        this.controls.clearInput();
        const sequence = ++this.loadSequence;
        this.loadTiming = { sequence, startedAtMs: performance.now(), coarseReadyAtMs: null, firstCoveredFrameAtMs: null, readyAtMs: null };
        this.loadAbort?.abort();
        this.selectionAbort?.abort();
        this.invalidateReport();
        this.loadingPlanning?.dispose();
        this.loadingPlanning = null;
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
            const stream = new LandscapeStreamer({ loaded, budget: this.budget, renderer: this.renderer, scene: this.scene, coverageSlots: this.coverageSlots.total, mode: this.mode, lodColors: this.lodColors, boundaries: this.boundaries });
            this.loadingStream = stream;
            await stream.initialize(this.camera);
            if (this.disposed || sequence !== this.loadSequence) { stream.dispose(); return; }
            this.stream?.dispose();
            this.appearance?.dispose();
            this.water?.dispose();
            this.planning?.dispose();
            this.loaded = loaded;
            if (!this.bookmarkStore || this.bookmarkStore.landscapeId !== loaded.manifest.id) this.bookmarkStore = new LandscapeBookmarks({ landscapeId: loaded.manifest.id, source: this.source });
            this.panel.bookmarks(this.bookmarkStore.snapshot());
            this.lastError = null;
            this.stream = stream;
            this.loadingStream = null;
            this.loadTiming.coarseReadyAtMs = performance.now();
            const appearance = new LandscapeAppearanceStreamer({ loaded, budget: this.budget, renderer: this.renderer, coverageSlots: this.coverageSlots,
                surfaceDetail: { levels: this.surfaceDetailLevels }, detailCache: this.ensureDetailCache(loaded) });
            this.appearance = this.loadingAppearance = appearance;
            stream.setAppearance(appearance);
            this.water = createLandscapeWaterReference({ manifest: loaded.manifest, budget: this.budget, scene: this.scene, visible: this.waterVisible });
            await appearance.initialize();
            if (this.disposed || sequence !== this.loadSequence) return;
            this.loadingAppearance = null;
            const planning = new LandscapePlanningOverlay({ loaded, scene: this.scene, budget: this.budget,
                visibility: this.planningVisibility, diagnostic: this.diagnostic });
            this.planning = this.loadingPlanning = planning;
            stream.setPlanning(planning);
            await planning.initialize();
            if (this.disposed || sequence !== this.loadSequence) return;
            this.loadingPlanning = null;
            this.loadTiming.readyAtMs = performance.now();
            this.panel.references(planning.features);
            this.syncPlanningPanel();
            if (this.bookmarkStore.error) this.panel.text('bookmark-status', this.bookmarkStore.error);
            const { manifest, chunk } = loaded;
            this.panel.text('source', `${manifest.name} · ${(manifest.bounds.maxX - manifest.bounds.minX) / 1000} × ${(manifest.bounds.maxZ - manifest.bounds.minZ) / 1000} km`);
            this.panel.text('revision', `Revision ${manifest.revision} · ${manifest.chunks.length} prepared tiles · Native level ${manifest.grid.maxLevel}`);
            this.panel.text('status', 'Worker streaming ready · Soil PBR + independent masks · Y up / +Z north · Native queries independent of appearance');
            this.panel.text('legend', `IMPORTED SURFACE REFERENCE\n${manifest.landCover.catalog.map(item => `${item.id}  ${item.label}`).join('\n')}\n\nNatural ground display: planning areas infer nearby substrate\nImported cover and soil queries remain unchanged\nWater: separate sea-level reference\nWorld grid: 200 m · Elevations: meters\nNative spacing: ${manifest.grid.spacingX.toFixed(3)} m`);
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

    // the content-addressed fine-page cache outlives appearance instances so reloads and edits reuse unaffected pages
    ensureDetailCache(loaded) {
        const pageBytes = landscapeCoverageMaskLayout(loaded.chunk.descriptor).pageBytes;
        if (this.detailCache && this.detailCachePageBytes === pageBytes) return this.detailCache;
        this.disposeDetailCache();
        const capacityBytes = landscapeSurfaceDetailCacheCapacity({ limits: this.budget.snapshot().limits, pageBytes, levels: this.surfaceDetailLevels });
        this.detailCache = capacityBytes ? new LandscapeSurfaceDetailCache({ budget: this.budget, key: `surface-detail-cache/${crypto.randomUUID()}`, capacityBytes }) : null;
        this.detailCachePageBytes = pageBytes;
        return this.detailCache;
    }

    disposeDetailCache() { this.detailCache?.dispose(); this.detailCache = null; this.detailCachePageBytes = null; }

    /** Generator-internal surface-detail inspection at a world position (async, through a detail worker). @param {number} x @param {number} z */
    detailSample(x, z) {
        if (!this.appearance) throw new Error('[Landscape] Load the landscape appearance before inspecting generated surface detail');
        return this.appearance.detailSample(x, z);
    }

    /** @param {boolean} enabled */
    setSurfaceWarp(enabled) {
        if (!this.appearance) throw new Error('[Landscape] Load the landscape appearance before changing the surface warp');
        this.appearance.setSurfaceWarp(enabled);
        return this.appearance.snapshot().surfaceWarp;
    }

    /** @param {boolean} enabled */
    setMaterialClumps(enabled) {
        if (!this.appearance) throw new Error('[Landscape] Load the landscape appearance before changing material clump relief');
        this.appearance.setMaterialClumps(enabled);
        return this.appearance.snapshot().materialClumps;
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
        this.cancelCameraRequest();
        this.controls.clearInput();
        this.perspectiveFov = fov;
        this.orthoHeight = orthoHeight;
        if (projection !== this.projection) {
            const previous = this.camera;
            this.camera = projection === 'orthographic' ? new THREE.OrthographicCamera(-2500, 2500, 2500, -2500, .1, 25000) : new THREE.PerspectiveCamera(fov, previous.aspect ?? 1, .1, 25000);
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
        for (const id of ['home', 'top', 'ground', 'pov']) this.panel.active(`camera:${id}`, false);
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

    setPlanning(options = {}) {
        if (!this.planning) throw new Error('Planning references are still loading');
        this.planning.set(options);
        this.planningVisibility = { ...this.planning.visible }; this.diagnostic = this.planning.diagnostic;
        this.panel.root.querySelector('[data-field="planning-panel"]').open = true;
        this.syncPlanningPanel();
        return this.planning.snapshot();
    }

    syncPlanningPanel() {
        const planning = this.planning?.snapshot();
        if (!planning) return;
        for (const [name, visible] of Object.entries(planning.visible)) this.panel.active(`planning:${name}`, visible);
        this.panel.root.querySelector('[data-field="diagnostic"]').value = planning.diagnostic;
        this.panel.text('planning-status', planning.errors.length ? `References unavailable or limited: ${planning.errors.join('; ')}`
            : `${planning.features.length} retained source references · Informational/advisory only`);
        const legend = { none: () => 'Material surface. Optional guides preserve source XZ and drape on the coarse overview.',
            elevation: () => 'Elevation: blue-green low → tan high. Contours every 5 m.', slope: () => 'Slope: green 0° → yellow 15° → red 35°+.',
            water: () => `Depth below sea level ${this.loaded.manifest.coordinates.seaLevel} m: cyan 0 → blue 10 m+. Gray-green is dry.`,
            'surface-level': () => `Surface detail level: shaded surface with a 50% tint of the finest contributing coverage page. ${LANDSCAPE_SURFACE_LEVEL_COLORS.map(entry => `L${entry.level} ${entry.name}`).join(' · ')}. Native level ${this.loaded.manifest.grid.maxLevel}; finer levels are generated.`,
            'surface-coverage': () => `Surface coverage: unlit false colors of normalized weights after hierarchy availability, before height competition. ${this.loaded.manifest.soil.catalog.map(soil => `${soil.id} ${LANDSCAPE_SURFACE_SOIL_COLORS[soil.id].name}`).join(' · ')}.` };
        const accuracy = planning.diagnostic.startsWith('surface-') ? 'Resident appearance coverage pages, independent of geometry LOD; generated levels are visual detail, not measured data.'
            : `Approximate displayed terrain LOD; use Inspect area for native samples. Guides use ${planning.accuracy.overviewSpacingMeters.toFixed(3)} m overview spacing.`;
        this.panel.text('diagnostic-legend', `${legend[planning.diagnostic]()}\n${accuracy}`);
    }

    referenceInfo(id = this.panel.root.querySelector('[data-field="reference-list"]').value) {
        const feature = this.planning?.features.find(value => value.id === id);
        if (!feature) return null;
        const point = feature.geometry.points[0], metadata = feature.metadata;
        this.panel.text('reference-info', `${feature.name} · ${feature.id}\n${feature.classification} source reference; no object is placed.`
            + (feature.geometry.type === 'point' ? `\nSource X ${point.x.toFixed(1)} / Y ${point.y?.toFixed(2) ?? 'unspecified'} / Z ${point.z.toFixed(1)} m` : '')
            + (metadata.targetElevationMeters !== undefined ? `\nSource design target ${metadata.targetElevationMeters} m; not a current terrain query.` : '')
            + (metadata.footprintMeters ? `\nReserved footprint ${metadata.footprintMeters.width} × ${metadata.footprintMeters.depth} m; orientation unspecified.` : '')
            + (metadata.note ? `\n${metadata.note}` : ''));
        return feature;
    }

    focusReference(id) {
        const feature = this.referenceInfo(id);
        if (!feature) throw new Error(`Unknown planning reference ${id}`);
        const bounds = feature.bounds, x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
        const y = landscapePlanningHeight(this.loaded.chunk, x, z), span = Math.max(100, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ), distance = span * 1.2;
        this.setCamera({ position: [x + distance * .7, y + distance * .8, z - distance * .8], target: [x, y, z], zoom: 1, orthoHeight: Math.min(20000, span * 1.6) });
        this.panel.root.querySelector('[data-field="reference-list"]').value = id;
        this.panel.root.querySelector('[data-field="planning-panel"]').open = true;
        return { id, target: [x, y, z], accuracy: 'overview-navigation' };
    }

    saveBookmark(name) {
        if (!this.bookmarkStore) throw new Error('Load a landscape before saving a camera bookmark');
        const record = this.bookmarkStore.save(name, this.snapshot().camera);
        this.panel.bookmarks(this.bookmarkStore.snapshot(), record.id);
        this.panel.text('bookmark-status', `Saved locally: ${record.name}. Terrain revision is unchanged.`);
        return record;
    }

    focusBookmark(id) {
        const record = this.bookmarkStore?.get(id);
        if (!record) throw new Error('No saved camera bookmarks are available');
        this.setCamera(record.camera); this.panel.bookmarks(this.bookmarkStore.snapshot(), id);
        return record;
    }

    removeBookmark(id) {
        if (!this.bookmarkStore) throw new Error('No saved camera bookmarks are available');
        this.bookmarkStore.remove(id); this.panel.bookmarks(this.bookmarkStore.snapshot());
        this.panel.text('bookmark-status', 'Bookmark removed from local viewer state.');
    }

    invalidateReport() {
        this.reportSequence++; this.reportAbort?.abort();
        this.report = { status: this.report.result ? 'stale' : 'idle', pending: false, result: null, error: null };
        this.panel?.text('report', 'Terrain report: select an area, then Inspect area.');
    }

    async reportSelection() {
        if (!this.loaded || !this.selection || this.selection.region.type === 'point') throw new Error('Select an explicit area with a positive radius before requesting its terrain report');
        this.reportAbort?.abort(); this.reportAbort = new AbortController();
        const sequence = ++this.reportSequence, manifest = this.loaded.manifest, region = this.selection.region;
        const diameter = region.type === 'circle' ? region.radius * 2 : Math.max(region.maxX - region.minX, region.maxZ - region.minZ);
        const constraints = (this.planning?.features ?? []).filter(feature => feature.geometry.type === 'polygon' && feature.geometry.points.length <= 128)
            .map(feature => ({ id: feature.id, classification: feature.classification, shape: { type: 'footprint', region: { type: 'polygon', points: feature.geometry.points.map(point => ({ x: point.x, z: point.z })) } } }));
        this.report = { status: 'pending', pending: true, result: null, error: null };
        this.panel.text('report', 'Resolving bounded native terrain report…');
        try {
            const response = await fetch('/api/landscape/report', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: this.reportAbort.signal,
                body: JSON.stringify({ expectedRevision: manifest.revision, shape: { type: 'footprint', region }, sampleSpacingMeters: Math.max(manifest.grid.spacingX, manifest.grid.spacingZ, diameter / 40), maxSamples: 4096, constraints }) });
            const result = await readLandscapeTerrainReport(response, { landscapeId: manifest.id, revision: manifest.revision });
            if (this.disposed || sequence !== this.reportSequence || manifest.revision !== this.loaded.manifest.revision) return null;
            this.report = { status: result.status, pending: false, result, error: null };
            const number = value => Number.isFinite(value) ? value.toFixed(2) : 'unknown';
            this.panel.text('report', `${result.status.toUpperCase()} · ${result.sampling.ready}/${result.sampling.requested} native probes at ${number(result.sampling.spacingMeters)} m\n`
                + `Elevation ${number(result.elevation?.min)}–${number(result.elevation?.max)} m · range ${number(result.elevation?.range)} m\n`
                + `Slope ${number(result.slopeDegrees?.min)}–${number(result.slopeDegrees?.max)}° · mean ${number(result.slopeDegrees?.mean)}°\n`
                + `Submerged ${number((result.water?.submergedFraction ?? NaN) * 100)}% · max depth ${number(result.water?.maxDepth)} m\n`
                + `Area ${number(result.area?.squareMeters)} m² · ${result.area?.exact ? 'exact shape area' : 'estimated area'}\n`
                + `Soil: ${(result.soilComposition ?? []).map(value => `${value.id} ${number(value.fraction * 100)}%`).join(', ')}\n`
                + `Cover: ${(result.coverComposition ?? []).map(value => `${value.id} ${number(value.fraction * 100)}%`).join(', ')}\n`
                + `Evaluated reference polygon overlaps: ${(result.overlaps ?? []).filter(value => value.intersects).map(value => value.id).join(', ') || 'none'}\nReference polygons only; other guides were not evaluated.\n`
                + `Unknown ${result.sampling.unknown} / outside ${result.sampling.outside}. Sampled extrema and probe fractions; not continuous surface guarantees.`);
            return result;
        } catch (error) {
            if (this.disposed || sequence !== this.reportSequence || error.name === 'AbortError') return null;
            this.report = { status: 'unavailable', pending: false, result: null, error: error.message };
            this.panel.text('report', `Terrain report unavailable: ${error.message}`); return null;
        }
    }

    async setBudgets(budgets) {
        this.performanceCapture?.dispose(); this.performanceCapture = null;
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
        this.loadingPlanning?.dispose(); this.loadingPlanning = null;
        this.planning?.dispose(); this.planning = null;
        this.invalidateReport();
        this.selectionAbort?.abort();
        for (const lease of this.consumerLeases.values()) lease.release();
        this.consumerLeases.clear();
        this.stream?.dispose();
        this.stream = null;
        this.loaded = null;
        this.disposeDetailCache();
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
        if (name === 'pov') return this.gamePov();
        const presets = {
            home: { position: { x: 4400, y: 3000, z: -2300 }, target: { x: 2000, y: 0, z: 2000 } },
            top: { position: { x: 2000, y: 5800, z: 1999 }, target: { x: 2000, y: 0, z: 2000 } },
            ground: { position: { x: 970, y: 115, z: 240 }, target: { x: 1680, y: 14, z: 1100 } }
        };
        if (!presets[name]) throw new Error(`Unknown camera preset: ${name}`);
        this.setCamera(presets[name]);
        for (const id of [...Object.keys(presets), 'pov']) this.panel.active(`camera:${id}`, id === name);
    }

    cancelCameraRequest() { this.cameraRequestAbort?.abort(); this.cameraRequestAbort = null; }

    async gamePov() {
        if (!this.loaded || !this.stream || this.reloading) throw new Error('Load the landscape before choosing Game POV');
        this.cancelCameraRequest();
        const request = new AbortController(); this.cameraRequestAbort = request;
        const manifest = this.loaded.manifest, point = this.selection?.position ?? this.controls.target;
        const x = Math.max(manifest.bounds.minX, Math.min(manifest.bounds.maxX, point.x));
        const z = Math.max(manifest.bounds.minZ, Math.min(manifest.bounds.maxZ, point.z));
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        direction.y = 0;
        if (direction.lengthSq() < 1e-12) direction.set(0, 0, 1); else direction.normalize();
        const options = { x, z, selectionId: `camera-${crypto.randomUUID()}`, expectedRevision: manifest.revision };
        const plan = planLandscapeRegion(manifest, { type: 'point', x, z });
        this.panel.notice('Resolving native ground for the Game POV camera…');
        try {
            const lease = await this.stream.acquireChunks(plan.chunkIds, { consumer: options.selectionId, priority: 100, accuracy: 'authoritative', signal: request.signal });
            let context;
            try { context = await queryLandscapeSelection(manifest, options, { readChunk: lease.readChunk, signal: request.signal }); }
            finally { lease.release(); }
            if (request.signal.aborted || this.disposed || manifest.revision !== this.loaded?.manifest.revision) return;
            if (!context.editingReady) throw new Error('Native ground is unavailable for this camera position');
            const height = context.position.y;
            this.setCamera({ projection: 'perspective', fov: LANDSCAPE_NAVIGATION.fov, zoom: 1,
                position: [x, height + LANDSCAPE_NAVIGATION.heightMeters, z],
                target: [x + direction.x * LANDSCAPE_NAVIGATION.lookDistanceMeters, height + LANDSCAPE_NAVIGATION.targetHeightMeters, z + direction.z * LANDSCAPE_NAVIGATION.lookDistanceMeters] });
            for (const id of ['home', 'top', 'ground', 'pov']) this.panel.active(`camera:${id}`, id === 'pov');
            this.panel.notice('Game POV: 55° FOV, camera 4.5 m above native ground. Arrows move; PageUp/PageDown change camera elevation. Free flight does not follow the ground.');
            this.canvas.focus({ preventScroll: true });
        } catch (error) {
            if (error.name !== 'AbortError' && !request.signal.aborted) throw error;
        } finally { if (this.cameraRequestAbort === request) this.cameraRequestAbort = null; }
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
        this.invalidateReport();
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
        this.setCamera({ position: { x: x + distance, y: y + distance * .8, z: z - distance }, target: { x, y, z } });
        for (const id of ['home', 'top', 'ground', 'pov']) this.panel.active(`camera:${id}`, false);
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
        this.invalidateReport();
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
        if (action === 'report-selection') return this.reportSelection();
        if (action === 'planning:diagnostic') return this.setPlanning({ diagnostic: this.panel.root.querySelector('[data-field="diagnostic"]').value });
        if (action.startsWith('planning:')) { const layer = action.slice(9); return this.setPlanning({ [layer]: !this.planningVisibility[layer] }); }
        if (action === 'reference:focus') return this.focusReference(this.panel.root.querySelector('[data-field="reference-list"]').value);
        if (action === 'reference:info') return this.referenceInfo();
        if (action === 'bookmark:save') return this.saveBookmark(this.panel.root.querySelector('[data-field="bookmark-name"]').value);
        if (action === 'bookmark:focus') return this.focusBookmark(this.panel.root.querySelector('[data-field="bookmark-list"]').value);
        if (action === 'bookmark:remove') return this.removeBookmark(this.panel.root.querySelector('[data-field="bookmark-list"]').value);
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
            loadTiming: this.loadTiming ? { ...this.loadTiming } : null,
            helpers: { grid: this.grid.visible, axes: this.axes.visible },
            sourceBytes: this.stream?.snapshot().sourceBytes ?? 0, memory: this.stream?.snapshot() ?? null,
            streaming: this.stream?.snapshot() ?? null, budget: this.budget.snapshot(),
            appearance: this.appearance?.snapshot() ?? null, water: this.water?.snapshot() ?? { visible: false, seaLevel: null },
            surfaceDetail: { mode: this.surfaceDetail, levels: this.surfaceDetailLevels, cache: this.detailCache?.snapshot() ?? null },
            planning: this.planning?.snapshot() ?? { ready: false, settled: !this.reloading, features: [], errors: [], cpuBytes: 0, gpuBytes: 0 },
            bookmarks: this.bookmarkStore?.snapshot() ?? [], report: this.report,
            uploadedBytesPerFrame: (this.stream?.snapshot().uploadedBytesPerFrame ?? 0) + (this.appearance?.snapshot().uploadedBytesPerFrame ?? 0) + (this.planning?.uploadedBytes ?? 0),
            peakUploadedBytesPerFrame: this.peakUploadedBytes,
            renderer: { ...this.renderer.info.render, memory: { ...this.renderer.info.memory } },
            canvas: { width: this.canvas.width, height: this.canvas.height }
        };
    }

    surfaceDetailLine(detail) {
        if (!detail.enabled) return `Generated surface detail ${this.surfaceDetail}: inactive (${detail.reason})`;
        const levels = Object.keys(detail.residentByLevel).map(level => `L${level} ${detail.residentByLevel[level]}/${detail.wantedByLevel[level]}`).join(' · ');
        return `Generated surface detail ${this.surfaceDetail}: ${levels} resident/wanted · ${detail.residentIds.length}/${detail.capacity} slots · ${detail.uniformIds.length} uniform · ${detail.pending} pending · cache ${detail.cache.hits} hits / ${detail.cache.misses} misses${detail.degradationReason ? ` · ${detail.degradationReason}` : ''}`;
    }

    /** @param {{maxFrames?:number}} [options] */
    beginPerformanceCapture(options = {}) {
        if (this.disposed || this.performanceCapture) throw new Error('Performance capture requires a live viewer without another active capture');
        this.performanceCapture = new LandscapePerformanceCapture({ ...options, budget: this.budget, gpuTimer: this.gpuTimer, nowMs: performance.now() });
        return { capacity: this.performanceCapture.capacity, cpuBytes: this.performanceCapture.cpuBytes, startedAtMs: this.performanceCapture.startedAtMs };
    }

    endPerformanceCapture() {
        if (!this.performanceCapture) throw new Error('No performance capture is active');
        const result = this.performanceCapture.finish(); this.performanceCapture = null;
        return result;
    }

    performanceMetadata() {
        const gl = this.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { userAgent: navigator.userAgent, platform: navigator.platform, hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemoryGiB: navigator.deviceMemory ?? null, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            renderer: { pixelRatio: this.renderer.getPixelRatio(), width: this.canvas.width, height: this.canvas.height,
                api: this.renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL', version: gl.getParameter(gl.VERSION),
                vendor: gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) },
            gpuTimer: this.gpuTimer.getDiagnostics(), budgets: this.budget.snapshot().limits,
            rendererSettings: { antialias: gl.getContextAttributes()?.antialias, powerPreference: gl.getContextAttributes()?.powerPreference,
                toneMapping: this.renderer.toneMapping, exposure: this.renderer.toneMappingExposure, outputColorSpace: this.renderer.outputColorSpace } };
    }

    resume() {
        if (this.disposed || this.frameRequest || document.hidden) return;
        this.lastFrame = performance.now();
        const frame = now => {
            this.frameRequest = null;
            if (this.disposed || document.hidden) return;
            const frameStart = this.performanceCapture ? performance.now() : 0;
            const rawDt = (now - this.lastFrame) / 1000;
            this.lastFrame = now;
            this.controls.update(Math.min(rawDt, .1));
            if (this.camera.isOrthographicCamera) this.camera.fov = 2 * Math.atan(this.orthoHeight / this.camera.zoom / (2 * this.camera.position.distanceTo(this.controls.target))) * 180 / Math.PI;
            if (!this.reloading) {
                this.appearance?.prepare(this.camera, this.canvas.height);
                this.stream?.update(rawDt, this.camera, this.canvas.height);
                const geometryStats = this.stream?.snapshot();
                const uploadLimit = geometryStats?.uploadLimitBytes ?? LANDSCAPE_STREAMING_BUDGETS.uploadBytesPerFrame;
                this.appearance?.update(rawDt, this.camera, this.canvas.height, Math.max(0, uploadLimit - (geometryStats?.uploadedBytesPerFrame ?? 0)));
                const terrainUploads = (geometryStats?.uploadedBytesPerFrame ?? 0) + (this.appearance?.uploadedBytes ?? 0);
                const planningUploads = this.planning?.update(Math.max(0, uploadLimit - terrainUploads)) ?? 0;
                this.peakUploadedBytes = Math.max(this.peakUploadedBytes, terrainUploads + planningUploads);
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
                if (appearance) this.panel.text('surface-detail', this.surfaceDetailLine(appearance.detail));
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
            if (this.stream && this.loadTiming?.coarseReadyAtMs !== null && this.loadTiming?.firstCoveredFrameAtMs === null) this.loadTiming.firstCoveredFrameAtMs = performance.now();
            this.perfBar.onFrame({ dt: Math.min(rawDt, .1), rawDt, nowMs: now, renderer: this.renderer, frameIndex: ++this.frameIndex });
            this.performanceCapture?.record({ nowMs: now, intervalMs: rawDt * 1000, cpuFrameMs: performance.now() - frameStart,
                geometryStreamingMs: this.reloading ? 0 : this.stream?.frameCostMs ?? 0,
                appearanceStreamingMs: this.reloading ? 0 : this.appearance?.frameCostMs ?? 0,
                uploadedBytes: this.reloading ? 0 : (this.stream?.uploadedBytes ?? 0) + (this.appearance?.uploadedBytes ?? 0) + (this.planning?.uploadedBytes ?? 0),
                render: this.renderer.info.render, memory: this.renderer.info.memory });
            this.frameRequest = requestAnimationFrame(frame);
        };
        this.frameRequest = requestAnimationFrame(frame);
    }

    pause() { cancelAnimationFrame(this.frameRequest); this.frameRequest = null; this.controls.clearInput(); this.cancelCameraRequest(); }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.pause();
        this.performanceCapture?.dispose(); this.performanceCapture = null;
        this.loadAbort?.abort();
        this.selectionAbort?.abort();
        this.reportAbort?.abort();
        this.abort.abort();
        this.resizeObserver.disconnect();
        this.controls.dispose();
        this.loadingStream?.dispose();
        this.loadingAppearance?.dispose();
        this.appearance?.dispose();
        this.appearance = null;
        this.disposeDetailCache();
        this.water?.dispose();
        this.water = null;
        this.loadingPlanning?.dispose(); this.loadingPlanning = null;
        this.planning?.dispose(); this.planning = null;
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
