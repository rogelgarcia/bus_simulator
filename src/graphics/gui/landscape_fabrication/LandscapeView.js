// Owns the landscape preview renderer, camera, and provisional inspection lifecycle.
// @ts-check
import * as THREE from 'three';
import { LandscapeCameraController } from './LandscapeCameraController.js';
import { LANDSCAPE_NAVIGATION } from './LandscapeNavigationState.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { loadLandscapeOverview, createLandscapeSelectionContext, sampleLandscapeChunk, planLandscapeRegion, queryLandscapeSelection, LandscapeResidencyBudget, LANDSCAPE_STREAMING_BUDGETS,
    LANDSCAPE_DEFAULT_DIRECTORY, probeLandscapeCache, describeLandscapeCacheAvailability } from '../../../app/landscape/index.js';
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
import { LANDSCAPE_MATERIAL_SAMPLING, landscapeMaterialSamplingMode } from '../../engine3d/landscape/LandscapeMaterialSampling.js';
import { LandscapeLighting } from '../../engine3d/landscape/LandscapeLighting.js';
import { createLandscapeAtmosphereBackdrop } from '../../engine3d/landscape/LandscapeAtmosphereBackdrop.js';
import { LANDSCAPE_LIGHTING, landscapeLightingTier } from '../../engine3d/landscape/LandscapeLightingModel.js';
import { LandscapeBookmarks } from './LandscapeBookmarks.js';
import { LandscapePerformanceCapture } from './LandscapePerformanceCapture.js';
import { readLandscapeTerrainReport } from '../../../app/landscape/LandscapeTerrainReports.js';
import { LANDSCAPE_TERRAIN_FIELD_RUNTIME } from '../../engine3d/landscape/LandscapeTerrainFieldPages.js';
import { LANDSCAPE_NATURAL_INFERENCE } from '../../engine3d/landscape/LandscapeNaturalInference.js';
import { LANDSCAPE_SURFACE_CACHE_RUNTIME, LandscapeSurfaceCache, landscapeSurfaceCacheAdmission } from '../../engine3d/landscape/LandscapeSurfaceCache.js';
import { LANDSCAPE_SURFACE_CACHE, LANDSCAPE_SURFACE_CACHE_CAPACITY, LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE, landscapeSurfaceCacheBudgets, landscapeSurfaceCacheCapacity } from '../../engine3d/landscape/LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_SURFACE_CACHE_NEAR } from '../../engine3d/landscape/LandscapeSurfaceCacheNearField.js';

const DEFAULT_SOURCE = `/${LANDSCAPE_DEFAULT_DIRECTORY}/manifest.json`;

/** Generated surface-detail modes: levels below the native cover grid (25 cm reaches 0.244 m samples on the coast). */
export const LANDSCAPE_SURFACE_DETAIL_MODES = Object.freeze({ off: 0, '50cm': 2, '25cm': 3 });

/** Companion multiscale sidecar modes: auto loads it when published, off keeps the schema-1 tiers. */
export const LANDSCAPE_MULTISCALE_MODES = Object.freeze(['auto', 'off']);

/** Terrain-field page modes (AI577 D5a): auto streams them when published, off keeps the terrain-field hooks and terrain-driven terms neutral. */
export const LANDSCAPE_TERRAIN_FIELD_MODES = LANDSCAPE_TERRAIN_FIELD_RUNTIME.modes;

/** Terrain-driven natural appearance (AI577 D5, landscape-terrain-appearance-v1) A/B modes. */
export const LANDSCAPE_TERRAIN_APPEARANCE_MODES = Object.freeze(['on', 'off']);

/** Natural display policy of planning-only cover (AI577 D5d): terrain-driven inference or the former 15.625 m overview infill. */
export const LANDSCAPE_NATURAL_INFERENCE_MODES = LANDSCAPE_NATURAL_INFERENCE.modes;

/** Runtime surface cache (AI577 D6 core, landscape-surface-cache-v1): off (the uncached program) or on. */
export const LANDSCAPE_SURFACE_CACHE_MODES = LANDSCAPE_SURFACE_CACHE_RUNTIME.modes;

/** Surface cache mode of a view that does not choose one (AI577 D7 decision: on; landscapeSurfaceCache=on|off overrides it). */
export { LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE };

/** A drawing buffer whose surface cache capacity changed (a resize) rebuilds the cache once its size has been stable this long (AI577 D7). */
const SURFACE_CACHE_CAPACITY_SETTLE_MS = 500;

/**
 * The largest drawing buffer a view's canvas can reach (AI577 D7): the display at the renderer's pixel ratio (devicePixelRatio, at most 2), or the
 * canvas's own drawing buffer when that is larger. It sizes the surface cache's budget profile, so a window enlarged up to full screen grows the cache's
 * capacity without a reload, while the capacity itself follows the current drawing buffer.
 * @param {{width:number,height:number}|null} [canvas]
 */
export function landscapeDisplayDrawingBuffer(canvas = null) {
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2), display = globalThis.screen;
    return { width: Math.max(1, Math.floor((display?.width || 0) * ratio), canvas?.width ?? 0), height: Math.max(1, Math.floor((display?.height || 0) * ratio), canvas?.height ?? 0) };
}

/** Shipped residency budget of a view drawing through the surface cache (AI577 D7): the profile of its display's capacity. @param {{width:number,height:number}|null} [canvas] */
export function landscapeSurfaceCacheShippedBudgets(canvas = null) {
    return landscapeSurfaceCacheBudgets(landscapeSurfaceCacheCapacity(landscapeDisplayDrawingBuffer(canvas)));
}

/** @param {string} name @param {readonly string[]} modes @param {string} value */
function requireViewMode(name, modes, value) {
    if (!modes.includes(value)) throw new Error(`[Landscape] ${name} must be one of ${modes.join(', ')}; received ${value}`);
    return value;
}

export class LandscapeView {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{source?:string,budgets?:{cpuBytes?:number,gpuBytes?:number},surfaceDetail?:'off'|'50cm'|'25cm',materialSampling?:string,multiscale?:'auto'|'off',lightingTier?:string,cityBinding?:any,
     *   naturalInference?:'terrain'|'overview',terrainFields?:'auto'|'off',terrainAppearance?:'on'|'off',surfaceCache?:'off'|'on',surfaceCacheSlots?:number|null,surfaceCacheWindow?:number|null,surfaceCacheAnisotropy?:number,
     *   surfaceCacheNear?:'on'|'off'}} options
     *   multiscale 'off' keeps the schema-1 material tiers without requesting the companion multiscale sidecar; lightingTier selects the compiled lighting tier (low, standard,
     *   high); cityBinding (a validated city landscape binding) rotates the game-frame sun and sky into landscape space by its yaw; naturalInference is
     *   the natural display policy of planning-only cover forwarded to both streams of every load (AI577 D5d); terrainFields 'off' never streams
     *   terrain-field pages (AI577 D5a); terrainAppearance 'off' keeps the terrain-driven natural appearance neutral (AI577 D5 A/B); surfaceCache 'on' draws the
     *   ground from the runtime surface cache (AI577 D6; default LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE) and then defaults the budgets to the profile of the
     *   display's capacity (landscapeSurfaceCacheShippedBudgets; explicit budgets keep their values; a profile without room above the streams' reserve keeps
     *   the cache off with its reason); the cache's slot target and window follow the drawing buffer (landscapeSurfaceCacheCapacity, AI577 D7) unless
     *   surfaceCacheSlots / surfaceCacheWindow fix them; surfaceCacheAnisotropy is its sampler anisotropy; surfaceCacheNear 'off' leaves the near field to the
     *   cache instead of evaluating it per pixel (landscape-surface-cache-near-v1 A/B evidence)
     */
    constructor(canvas, { source = DEFAULT_SOURCE, budgets = {}, surfaceDetail = '25cm', materialSampling = LANDSCAPE_MATERIAL_SAMPLING.defaultMode, multiscale = 'auto',
        lightingTier = LANDSCAPE_LIGHTING.defaultTier, cityBinding = null, naturalInference = LANDSCAPE_NATURAL_INFERENCE.defaultMode, terrainFields = 'auto', terrainAppearance = 'on',
        surfaceCache = LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE, surfaceCacheSlots = null, surfaceCacheWindow = null, surfaceCacheAnisotropy = LANDSCAPE_SURFACE_CACHE.maxAnisotropy,
        surfaceCacheNear = 'on' } = {}) {
        if (!Object.hasOwn(LANDSCAPE_SURFACE_DETAIL_MODES, surfaceDetail)) throw new Error(`[Landscape] surfaceDetail must be one of ${Object.keys(LANDSCAPE_SURFACE_DETAIL_MODES).join(', ')}; received ${surfaceDetail}`);
        if (!LANDSCAPE_MULTISCALE_MODES.includes(multiscale)) throw new Error(`[Landscape] multiscale must be one of ${LANDSCAPE_MULTISCALE_MODES.join(', ')}; received ${multiscale}`);
        landscapeMaterialSamplingMode(materialSampling);
        this.naturalInference = requireViewMode('naturalInference', LANDSCAPE_NATURAL_INFERENCE_MODES, naturalInference);
        this.terrainFields = requireViewMode('terrainFields', LANDSCAPE_TERRAIN_FIELD_MODES, terrainFields);
        requireViewMode('terrainAppearance', LANDSCAPE_TERRAIN_APPEARANCE_MODES, terrainAppearance);
        this.surfaceCache = requireViewMode('surfaceCache', LANDSCAPE_SURFACE_CACHE_MODES, surfaceCache);
        this.surfaceCacheOptions = { slots: surfaceCacheSlots, windowPages: surfaceCacheWindow, anisotropy: surfaceCacheAnisotropy,
            near: { mode: requireViewMode('surfaceCacheNear', LANDSCAPE_SURFACE_CACHE_NEAR.modes, surfaceCacheNear) } };
        this.surfaceCacheRuntime = null;
        this.surfaceCacheSequence = 0;
        this.surfaceCacheCapacityRebuilds = 0;
        this.drawingBufferKey = null;
        this.capacityTimer = null;
        this.materialSampling = materialSampling;
        this.multiscale = multiscale;
        this.surfaceLayers = null;
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
        this.programRequests = 0;
        this.report = { status: 'idle', pending: false, result: null, error: null };
        this.reportSequence = 0;
        this.budget = new LandscapeResidencyBudget(this.surfaceCache === 'on' ? { ...landscapeSurfaceCacheShippedBudgets(canvas), ...budgets } : budgets);
        this.consumerLeases = new Map();
        this.selection = null;
        this.selectionRadius = 25;
        this.selectionSequence = 0;
        this.handoffQueue = Promise.resolve();
        this.disposed = false;
        this.cacheAvailability = null;
        this.frameIndex = 0;
        this.peakUploadedBytes = 0;
        this.loadSequence = 0;
        this.abort = new AbortController();
        this.perfBar = ensureGlobalPerfBar();
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
        this.coverageSlots = chooseLandscapeCoverageSlots(this.renderer);
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        // the game's resolved tone mapping, exposure, calibrated sun and HDR sky (the terrain and water shaders read its shared uniforms)
        this.lighting = new LandscapeLighting({ renderer: this.renderer, scene: this.scene, tier: landscapeLightingTier(lightingTier), binding: cityBinding });
        if (terrainAppearance === 'off') this.lighting.setResponse({ terrainAppearance: false });
        this.backdrop = createLandscapeAtmosphereBackdrop({ scene: this.scene, lighting: this.lighting });
        this.camera = new THREE.PerspectiveCamera(this.perspectiveFov, 1, 0.1, 25000);
        this.camera.position.set(4400, 3000, -2300);
        this.panel = new LandscapePanel(action => Promise.resolve(this.action(action)).catch(error => this.panel.notice(error.message)));
        this.panel.active('water', true);
        this.controls = new LandscapeCameraController(this.camera, canvas, { uiRoot: this.panel.root,
            onClick: event => this.pick(event.clientX, event.clientY), onNavigate: () => this.cancelCameraRequest(),
            onZoom: () => { this.panel.root.querySelector('[data-field="zoom"]').value = String(this.camera.zoom.toFixed(2)); } });
        this.controls.setLookAt({ position: this.camera.position, target: { x: 2000, y: 0, z: 2000 } });
        this.controls.setHomeFromCurrent();
        // inspection overlays show their authored colors, independent of the scene exposure
        this.marker = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffeaa8, depthTest: false, toneMapped: false }));
        this.marker.renderOrder = 10;
        this.marker.visible = false;
        this.scene.add(this.marker);
        this.selectionOutline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffeaa8, depthTest: false, toneMapped: false }));
        this.selectionOutline.renderOrder = 9;
        this.selectionOutline.visible = false;
        this.scene.add(this.selectionOutline);
        this.grid = new THREE.GridHelper(4000, 20, 0xc5d8d7, 0x819993);
        this.grid.material.toneMapped = false;
        this.grid.position.set(2000, .4, 2000);
        this.grid.visible = false;
        this.scene.add(this.grid);
        this.axes = new THREE.AxesHelper(350);
        this.axes.material.toneMapped = false;
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
            // the calibrated sky loads alongside the overview, so the first terrain frame is already lit like the game
            const [loaded] = await Promise.all([loadLandscapeOverview(this.source, { signal: this.loadAbort.signal }), this.lighting.ready]);
            if (this.disposed || sequence !== this.loadSequence) return;
            this.lighting.setSeaLevel(loaded.manifest.coordinates.seaLevel);
            // AI577 D6: the tiles compile the cached frame variant only where a surface cache can run (a rebinding runtime, or a device and budget profile
            // that admit one); otherwise they compile the uncached program from the start instead of drawing the cache's bootstrap while it links
            const runtime = this.surfaceCacheRuntime, capacity = this.surfaceCacheCapacity(), cached = this.surfaceCache === 'on' && (this.canRebindSurfaceCache(runtime, loaded, capacity)
                || landscapeSurfaceCacheAdmission({ renderer: this.renderer, budget: this.budget, bounds: loaded.manifest.bounds, coverageSlots: this.coverageSlots.total,
                    targetSlots: capacity.targetSlots, windowPages: capacity.windowPages, headroom: false }).admitted);
            const stream = new LandscapeStreamer({ loaded, budget: this.budget, renderer: this.renderer, scene: this.scene, coverageSlots: this.coverageSlots.total, materialSampling: this.materialSampling,
                lighting: this.lighting, lightingTier: this.lighting.tier, mode: this.mode, lodColors: this.lodColors, boundaries: this.boundaries, naturalInference: this.naturalInference,
                diagnostics: this.diagnostic !== 'none', terrainAppearance: this.lighting.response.terrainAppearance, surfaceCache: cached });
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
            this.cacheAvailability = null;
            this.stream = stream;
            this.loadingStream = null;
            this.loadTiming.coarseReadyAtMs = performance.now();
            const appearance = new LandscapeAppearanceStreamer({ loaded, budget: this.budget, renderer: this.renderer, coverageSlots: this.coverageSlots,
                surfaceDetail: { levels: this.surfaceDetailLevels }, detailCache: this.ensureDetailCache(loaded), materialSampling: this.materialSampling, multiscale: this.multiscale,
                terrainFields: this.terrainFields, naturalInference: this.naturalInference });
            this.appearance = this.loadingAppearance = appearance;
            stream.setAppearance(appearance);
            if (this.surfaceCache === 'on') this.attachSurfaceCache(loaded, stream, appearance);
            this.water = createLandscapeWaterReference({ manifest: loaded.manifest, budget: this.budget, scene: this.scene, lighting: this.lighting, visible: this.waterVisible });
            await appearance.initialize();
            if (this.disposed || sequence !== this.loadSequence) return;
            this.loadingAppearance = null;
            if (this.surfaceLayers && appearance.initialized) appearance.setSurfaceLayers(this.surfaceLayers);
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
            this.panel.text('legend', `IMPORTED SURFACE REFERENCE\n${manifest.landCover.catalog.map(item => `${item.id}  ${item.label}`).join('\n')}\n\nNatural ground display: planning areas infer nearby substrate\nImported cover and soil queries remain unchanged\nWater: separate sea-level reference\nWorld grid: 200 m · Elevations: meters\nNative spacing: ${manifest.grid.spacingX.toFixed(3)} m\n${this.lightingLine()}`);
            this.panel.notice('');
            if (this.selection) this.select(this.selection.position.x, this.selection.position.z);
            this.perfBar.requestUpdate();
        } catch (error) {
            if (error.name === 'AbortError' || sequence !== this.loadSequence || this.disposed) return;
            // the landscape cache is local (never tracked by Git); without a loaded revision, say whether it is missing, stale or incomplete
            const cache = this.loaded ? null : await probeLandscapeCache(this.source, { signal: this.loadAbort.signal, payloads: true }).catch(() => null);
            if (sequence !== this.loadSequence || this.disposed) return;
            this.cacheAvailability = cache;
            if (cache && !cache.available) this.panel.notice(describeLandscapeCacheAvailability(cache));
            else this.panel.notice(`Landscape update rejected: ${error.message}. ${this.loaded ? 'The last valid revision remains visible.' : 'Check the prepared manifest and local server.'}`);
            this.panel.text('status', this.loaded ? `Showing last valid revision ${this.loaded.manifest.revision}` : cache && !cache.available ? `No landscape loaded: cache ${cache.status}` : 'No valid terrain loaded');
            this.lastError = error.message;
        } finally {
            this.budget.release(loadKey);
            if (sequence === this.loadSequence) this.reloading = false;
        }
    }

    // AI577 D6: the runtime surface cache bound to a load's geometry and appearance streams. A reload of the same landscape at the same budget and
    // capacity rebinds the runtime (its atlases and linked programs carry over; every page regenerates); otherwise a new runtime replaces it, sized for
    // the current drawing buffer (AI577 D7). A cache that cannot be admitted (device, budget) reports why, and tiles that compiled the cached frame
    // variant return to the uncached program, so the view never waits on an absent cache
    attachSurfaceCache(loaded, stream, appearance) {
        const current = this.surfaceCacheRuntime, capacity = this.surfaceCacheCapacity();
        if (this.canRebindSurfaceCache(current, loaded, capacity)) current.bind({ stream, appearance, loaded });
        else {
            current?.dispose();
            const { anisotropy, near } = this.surfaceCacheOptions;
            this.surfaceCacheRuntime = new LandscapeSurfaceCache({ renderer: this.renderer, budget: this.budget, loaded, coverageSlots: this.coverageSlots.total,
                targetSlots: capacity.targetSlots, windowPages: capacity.windowPages, capacityReason: capacity.reason, anisotropy, near });
            this.surfaceCacheRuntime.bind({ stream, appearance });
        }
        if (!this.surfaceCacheRuntime.available) {
            this.panel.notice(`Surface cache unavailable: ${this.surfaceCacheRuntime.reason}`);
            stream.setSurfaceCache(false, this.camera).catch(error => { if (error.name !== 'AbortError') this.lastError = error.message; });
        }
        return this.surfaceCacheRuntime;
    }

    /**
     * AI577 D6 runtime surface cache switch (test hook). 'on' creates and binds the cache and switches the tiles to the cached frame program once its root
     * page is resident (until then they keep their current program); 'off' switches them back to the uncached program and then disposes the cache, so
     * the ledger returns its bytes. Resolves with the cache snapshot once the request is applied (or superseded).
     * @param {'off'|'on'} mode
     */
    async setSurfaceCache(mode) {
        requireViewMode('surfaceCache', LANDSCAPE_SURFACE_CACHE_MODES, mode);
        const sequence = ++this.surfaceCacheSequence;
        this.surfaceCache = mode;
        if (!this.loaded || !this.stream || !this.appearance) return this.appearance?.snapshot().surfaceCache ?? null;
        if (mode === 'on') {
            const runtime = this.surfaceCacheRuntime?.available && this.surfaceCacheRuntime.stream === this.stream ? this.surfaceCacheRuntime : this.attachSurfaceCache(this.loaded, this.stream, this.appearance);
            const started = performance.now();
            while (runtime.available && !runtime.ready && sequence === this.surfaceCacheSequence && !this.disposed) {
                if (performance.now() - started > LANDSCAPE_SURFACE_CACHE_RUNTIME.compileWaitMs + 30000) throw new Error('[Landscape] The surface cache root page was not generated in time');
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            if (sequence === this.surfaceCacheSequence && runtime.available) await this.syncTerrainProgram({ surfaceCache: true });
        } else {
            await this.syncTerrainProgram({ surfaceCache: false });
            if (sequence === this.surfaceCacheSequence) { this.surfaceCacheRuntime?.dispose(); this.surfaceCacheRuntime = null; if (this.appearance) this.appearance.surfaceCache = null; }
        }
        return this.appearance?.snapshot().surfaceCache ?? null;
    }

    /** CPU mirror of the cached frame's page lookup at a world position for a footprint in meters (AI577 D6 inspection). @param {number} x @param {number} z @param {number} footprint */
    surfaceCacheLookup(x, z, footprint) { return this.surfaceCacheRuntime?.lookup(x, z, footprint) ?? null; }

    /**
     * Surface cache capacity of the current drawing buffer (AI577 D7, landscapeSurfaceCacheCapacity): its slot target and window, or the explicit
     * surfaceCacheSlots / surfaceCacheWindow options in their place (their reason is then null).
     */
    surfaceCacheCapacity() {
        const policy = landscapeSurfaceCacheCapacity({ width: Math.max(1, this.canvas.width), height: Math.max(1, this.canvas.height) }), { slots, windowPages } = this.surfaceCacheOptions;
        const explicit = slots !== null || windowPages !== null;
        return { ...policy, targetSlots: slots ?? policy.targetSlots, windowPages: windowPages ?? policy.windowPages, explicit, reason: explicit ? null : policy.reason };
    }

    /**
     * AI577 D7 evidence switch: fixes the surface cache's slot target and window (null follows the drawing buffer) and rebuilds the cache when its
     * capacity changes. Resolves with the cache snapshot once applied. @param {{slots?:number|null,windowPages?:number|null}} [capacity]
     */
    async setSurfaceCacheCapacity({ slots = null, windowPages = null } = {}) {
        if (slots !== null && (!Number.isSafeInteger(slots) || slots < 256 || slots > LANDSCAPE_SURFACE_CACHE_CAPACITY.maximumSlots || slots % 256)) {
            throw new Error(`[Landscape] surface cache slots must be a multiple of 256 from 256 to ${LANDSCAPE_SURFACE_CACHE_CAPACITY.maximumSlots}; received ${slots}`);
        }
        if (windowPages !== null && ![64, 128, 256].includes(windowPages)) throw new Error(`[Landscape] surface cache window must be 64, 128 or 256; received ${windowPages}`);
        this.surfaceCacheOptions = { ...this.surfaceCacheOptions, slots, windowPages };
        await this.syncSurfaceCacheCapacity();
        return this.appearance?.snapshot().surfaceCache ?? null;
    }

    // applies the drawing buffer's capacity once its size has settled (and any load in progress has finished)
    scheduleSurfaceCacheCapacity() {
        clearTimeout(this.capacityTimer);
        this.capacityTimer = setTimeout(() => {
            if (this.disposed) return;
            if (this.reloading) { this.scheduleSurfaceCacheCapacity(); return; }
            this.syncSurfaceCacheCapacity().catch(error => { if (error.name !== 'AbortError') this.lastError = error.message; });
        }, SURFACE_CACHE_CAPACITY_SETTLE_MS);
    }

    /** Whether a runtime can serve a load: the same budget and landscape extent at the capacity wanted now. @param {any} runtime @param {any} loaded @param {any} capacity */
    canRebindSurfaceCache(runtime, loaded, capacity) {
        return !!runtime && runtime.budget === this.budget && runtime.canRebind(loaded) && runtime.fit.targetSlots === capacity.targetSlots && runtime.geometry.windowPages === capacity.windowPages;
    }

    /**
     * AI577 D7: rebuilds the surface cache when the drawing buffer's capacity (slot target or window) differs from the cache's, as a resize past a layer
     * or window step makes it: the tiles switch to the uncached program, the cache is disposed and a new one at the new capacity switches back once its
     * root page is resident, as when the cache is switched on. Resolves with the new cache snapshot, or null when nothing changed.
     */
    async syncSurfaceCacheCapacity() {
        const runtime = this.surfaceCacheRuntime;
        if (this.disposed || this.reloading || this.surfaceCache !== 'on' || !runtime?.available || runtime.stream !== this.stream || !this.appearance) return null;
        const capacity = this.surfaceCacheCapacity();
        if (runtime.fit.targetSlots === capacity.targetSlots && runtime.geometry.windowPages === capacity.windowPages) return null;
        this.surfaceCacheCapacityRebuilds++;
        await this.setSurfaceCache('off');
        return this.setSurfaceCache('on');
    }

    /**
     * Near pass of the surface cache (A/B evidence): 'off' leaves the near field to the cache; band overrides the hand-over band in mip-0 texels.
     * @param {'on'|'off'} mode @param {{startTexels?:number,endTexels?:number}} [band]
     */
    setSurfaceCacheNear(mode, band = {}) {
        requireViewMode('surfaceCacheNear', LANDSCAPE_SURFACE_CACHE_NEAR.modes, mode);
        this.surfaceCacheOptions.near = { mode, ...band };
        return this.surfaceCacheRuntime?.setNear(mode, band) ?? null;
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

    /** Recompiles the terrain programs for a stochastic material sampling mode (A/B evidence; the program compiles on the next draw). @param {string} mode */
    setMaterialSampling(mode) {
        landscapeMaterialSamplingMode(mode);
        this.materialSampling = mode;
        this.loadingStream?.setMaterialSampling(mode);
        this.stream?.setMaterialSampling(mode);
        this.loadingAppearance?.setMaterialSampling(mode);
        this.appearance?.setMaterialSampling(mode);
        return this.appearance?.snapshot().materialSampling ?? { mode };
    }

    /**
     * Enables or disables the D4 appearance layers (landscape-scale macro variation, paired micro detail, slope-adaptive projection and
     * normal mip filtering) for A/B evidence; the choice persists across reloads. @param {{macro?:boolean,micro?:boolean,projection?:boolean,normalFiltering?:boolean}} layers
     */
    setSurfaceLayers(layers) {
        if (!this.appearance) throw new Error('[Landscape] Load the landscape appearance before changing surface layers');
        this.appearance.setSurfaceLayers(layers);
        this.surfaceLayers = { ...(this.surfaceLayers ?? {}), ...layers };
        return this.appearance.snapshot().surfaceLayers;
    }

    /**
     * Recompiles the terrain and water programs for a lighting tier (A/B evidence; like setMaterialSampling, the programs compile on the next draw).
     * AI577 D5c A/B switches without recompiling: response (natural-ground material response, terrain-reflected light, terrain-field visibility;
     * kept by the view lighting across reloads) and calibration (landscape-local albedo gains and normal de-leaning of the loaded appearance).
     * @param {{tier?:string,response?:{model?:boolean,bounce?:boolean,terrainVisibility?:boolean},calibration?:{albedo?:boolean,normalLean?:boolean}}} options
     */
    setLighting({ tier, response, calibration } = {}) {
        if (calibration !== undefined && !this.appearance?.materials?.initialized) throw new Error('[Landscape] Load the landscape appearance before changing the material calibration');
        if (tier !== undefined) {
            landscapeLightingTier(tier);
            this.lighting.setTier(tier);
            this.loadingStream?.setLightingTier(tier);
            this.stream?.setLightingTier(tier);
            this.water?.setLightingTier(tier);
            this.backdrop.setLightingTier(tier);
        }
        if (response !== undefined) this.lighting.setResponse(response);
        // AI577 D6: the terrain-driven appearance switch is a compiled program variant; uLandscapeResponse.w keeps gating the rock factor
        if (response?.terrainAppearance !== undefined) this.syncTerrainProgram({ terrainAppearance: this.lighting.response.terrainAppearance });
        if (calibration !== undefined) this.appearance.materials.setCalibration(calibration);
        return { ...this.lighting.snapshot(), backdrop: this.backdrop.snapshot(), calibration: this.appearance?.materials?.calibrationSwitches ? { ...this.appearance.materials.calibrationSwitches } : null };
    }

    /**
     * AI577 D5 A/B of the terrain-driven natural appearance, kept across reloads. Since AI577 D6 the switch selects a compiled terrain program variant
     * (LANDSCAPE_TERRAIN_APPEARANCE), linked in parallel before the tiles switch, and sets uLandscapeResponse.w and the JavaScript mirrors at once.
     * @param {boolean} enabled
     */
    setTerrainAppearance(enabled) {
        if (typeof enabled !== 'boolean') throw new Error('[Landscape] Terrain appearance enablement must be boolean');
        this.lighting.setResponse({ terrainAppearance: enabled });
        this.syncTerrainProgram({ terrainAppearance: enabled });
        return { ...this.lighting.snapshot().response.switches };
    }

    /** Reloads with another natural display policy of planning-only cover (AI577 D5d A/B), forwarded to both streams. @param {'terrain'|'overview'} mode */
    setNaturalInference(mode) {
        this.naturalInference = requireViewMode('naturalInference', LANDSCAPE_NATURAL_INFERENCE_MODES, mode);
        return this.load();
    }

    /** Reloads with or without the terrain-field pages (AI577 D5a). @param {'auto'|'off'} mode */
    setTerrainFields(mode) {
        this.terrainFields = requireViewMode('terrainFields', LANDSCAPE_TERRAIN_FIELD_MODES, mode);
        return this.load();
    }

    /**
     * JavaScript mirror of the terrain-driven appearance inputs at a world position (landscape-terrain-appearance-v1); height and slope default to the
     * rendered terrain there. @param {number} x @param {number} z @param {{height?:number,slopeDegrees?:number,footprint?:number}} [options]
     */
    terrainAppearanceSample(x, z, { height, slopeDegrees, footprint = 0 } = {}) {
        if (!this.appearance || !this.loaded) throw new Error('[Landscape] Load the landscape appearance before sampling the terrain-driven appearance');
        const terrain = sampleLandscapeChunk(this.loaded.manifest, this.stream?.renderedChunkAt(x, z) ?? this.loaded.chunk, x, z);
        if (terrain.status !== 'ready' && (height === undefined || slopeDegrees === undefined)) return null;
        return this.appearance.terrainAppearanceSample(x, z, { height: height ?? terrain.height, slopeDegrees: slopeDegrees ?? terrain.slopeDegrees, footprint,
            enabled: this.lighting.response.terrainAppearance });
    }

    /** Natural dressing inputs (landscape-dressing-inputs v1) of the displayed soil at a world position. @param {number} x @param {number} z @param {{dx?:number[],dy?:number[]}} [options] */
    dressingSample(x, z, options) {
        if (!this.appearance) throw new Error('[Landscape] Load the landscape appearance before sampling dressing inputs');
        return this.appearance.dressingSample(x, z, options);
    }

    lightingLine() {
        const state = this.lighting.snapshot();
        return `Lighting ${state.tier}: game ${state.toneMapping.toUpperCase()} exposure ${state.exposure.toPrecision(3)} · sun az ${state.sun.azimuthDeg.toFixed(0)}° el ${state.sun.elevationDeg.toFixed(0)}° · ${state.status === 'ready' ? state.environment.iblId : `sky unavailable: ${state.error}`}`;
    }

    /** @param {boolean} enabled runtime stochastic tiling of the compiled mode; disabled soils keep one lattice sample */
    setMaterialSamplingEnabled(enabled) {
        if (!this.appearance) throw new Error('[Landscape] Load the landscape appearance before changing material sampling');
        this.appearance.setMaterialSamplingEnabled(enabled);
        return this.appearance.snapshot().materialSampling;
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.renderer.setSize(Math.round(rect.width), Math.round(rect.height), false);
        // AI577 D7: a changed drawing buffer may change the surface cache's capacity; it is applied once the size has settled
        const drawingBuffer = `${this.canvas.width}x${this.canvas.height}`;
        if (drawingBuffer !== this.drawingBufferKey) {
            this.drawingBufferKey = drawingBuffer;
            this.scheduleSurfaceCacheCapacity();
        }
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
        if (this.water) this.water.setVisible(visible); else this.lighting.setWaterVisible(visible);
        this.panel.active('water', visible);
    }

    setPlanning(options = {}) {
        if (!this.planning) throw new Error('Planning references are still loading');
        this.planning.set(options);
        this.planningVisibility = { ...this.planning.visible }; this.diagnostic = this.planning.diagnostic;
        this.syncTerrainDiagnostics();
        this.panel.root.querySelector('[data-field="planning-panel"]').open = true;
        this.syncPlanningPanel();
        return this.planning.snapshot();
    }

    // AI577 D6: the default terrain program carries no inspection code; selecting any diagnostic links the diagnostics program in parallel and the
    // tiles switch once it is ready (snapshot().terrainProgramVariant, streaming.settled waits for it), returning to 'none' switches back
    syncTerrainDiagnostics() { this.syncTerrainProgram({ diagnostics: this.diagnostic !== 'none' }); }

    /**
     * @param {{diagnostics?:boolean,terrainAppearance?:boolean,surfaceCache?:boolean}} changes compiled program variant of every terrain tile (LandscapeStreamer.setProgramVariant)
     * @returns {Promise<void>} settles once every stream applied (or superseded) the request
     */
    syncTerrainProgram(changes) {
        const streams = [this.loadingStream, this.stream].filter(Boolean), requests = streams.map(stream => stream.setProgramVariant(changes, this.camera));
        const sequence = ++this.programRequests, linkingNotice = 'Linking the terrain program variant; the current view stays interactive.';
        // the notice follows the latest request (a superseded link settles silently) and never clears another message shown meanwhile
        const settle = () => { if (!this.disposed && sequence === this.programRequests && this.panel.root.querySelector('[data-field="notice"]')?.textContent === linkingNotice) this.panel.notice(''); };
        if (streams.some(stream => stream.programVariantState().pending)) this.panel.notice(linkingNotice);
        else settle();
        return Promise.all(requests).then(settle, error => {
            if (error.name === 'AbortError' || this.disposed) return;
            this.lastError = error.message;
            this.panel.notice(`Terrain program variant unavailable: ${error.message}`);
        });
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
            'surface-coverage': () => `Surface coverage: unlit false colors of normalized weights after hierarchy availability, before height competition. ${this.loaded.manifest.soil.catalog.map(soil => `${soil.id} ${LANDSCAPE_SURFACE_SOIL_COLORS[soil.id].name}`).join(' · ')}.`,
            'terrain-appearance': () => 'Terrain-driven appearance inputs: gray neutral · blue moist hollows · orange dry ridges and steep slopes (catena from the landscape-scale terrain fields) · cyan sea-wetted ground · red revealed rock · darkened where planning cover excludes the terrain terms.',
            dressing: () => 'Natural dressing inputs of the displayed soil: green grass · ochre shrubs · dark green trees · blue-gray rock scatter · pink beach debris · dark slate planning cover reserved for city content. Placement is not part of the viewer.',
            ...Object.fromEntries(['grass', 'shrub', 'tree', 'rock', 'debris'].map(output => [`dressing-${output}`, () => `Dressing input ${output}: gray value 0 (black) to 1 (white) of landscape-dressing-inputs v1, planning cover reserved.`])) };
        const accuracy = planning.diagnostic.startsWith('surface-') ? 'Resident appearance coverage pages, independent of geometry LOD; generated levels are visual detail, not measured data.'
            : planning.diagnostic === 'terrain-appearance' || planning.diagnostic.startsWith('dressing') ? 'Derived from the resident terrain-field and mask pages; terrain fields are unmeasured offline analyses.'
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
        this.surfaceCacheRuntime?.dispose(); this.surfaceCacheRuntime = null;
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

    /** The rendered terrain point under a client position, or null. @param {number} clientX @param {number} clientY */
    pickPoint(clientX, clientY) {
        if (!this.stream) return null;
        const rect = this.canvas.getBoundingClientRect();
        // a programmatic camera change refreshes the camera matrices only at the next render; a pick before it must not use the previous view
        this.camera.updateMatrixWorld();
        this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
        const meshes = this.stream.renderedMeshes();
        for (const mesh of meshes) mesh.updateMatrixWorld();
        return this.raycaster.intersectObjects(meshes, false)[0]?.point ?? null;
    }

    pick(clientX, clientY) {
        if (!this.stream) return null;
        const point = this.pickPoint(clientX, clientY);
        if (!point) { this.clearSelection(); this.panel.text('selection', 'No terrain at this point.'); return null; }
        return this.select(point.x, point.z);
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
            cache: this.cacheAvailability ? { status: this.cacheAvailability.status, reason: this.cacheAvailability.reason ?? null } : null,
            loadTiming: this.loadTiming ? { ...this.loadTiming } : null, terrainProgram: (this.loadingStream ?? this.stream)?.programCompile ?? null,
            terrainProgramVariant: (this.loadingStream ?? this.stream)?.programVariantState() ?? null,
            helpers: { grid: this.grid.visible, axes: this.axes.visible },
            sourceBytes: this.stream?.snapshot().sourceBytes ?? 0, memory: this.stream?.snapshot() ?? null,
            streaming: this.stream?.snapshot() ?? null, budget: this.budget.snapshot(),
            appearance: this.appearance?.snapshot() ?? null, water: this.water?.snapshot() ?? { visible: false, seaLevel: null }, lighting: { ...this.lighting.snapshot(), backdrop: this.backdrop.snapshot() },
            surfaceDetail: { mode: this.surfaceDetail, levels: this.surfaceDetailLevels, cache: this.detailCache?.snapshot() ?? null },
            materialSampling: this.materialSampling, multiscale: this.multiscale, naturalInference: this.naturalInference, terrainFields: this.terrainFields,
            terrainAppearance: this.lighting.response.terrainAppearance ? 'on' : 'off', surfaceCache: this.surfaceCache,
            surfaceCacheCapacity: { ...this.surfaceCacheCapacity(), display: landscapeDisplayDrawingBuffer(), rebuilds: this.surfaceCacheCapacityRebuilds,
                runtime: this.surfaceCacheRuntime?.available ? { targetSlots: this.surfaceCacheRuntime.fit.targetSlots, slots: this.surfaceCacheRuntime.fit.slots, windowPages: this.surfaceCacheRuntime.geometry.windowPages } : null },
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
            // a frame's time can precede a resume that ran just before its callbacks; a negative interval would run transitions backwards
            const rawDt = Math.max(0, (now - this.lastFrame) / 1000);
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
                // AI577 D6: surface cache demand and page generation run on the GPU before the frame, the indirection uploads with them
                const cacheUploads = this.surfaceCacheRuntime?.update({ dt: rawDt, camera: this.camera, viewportHeight: this.canvas.height, viewportWidth: this.canvas.width,
                    uploadAllowance: Math.max(0, uploadLimit - terrainUploads - planningUploads), frameGpuMs: this.gpuTimer.getLastMs() }) ?? 0;
                this.peakUploadedBytes = Math.max(this.peakUploadedBytes, terrainUploads + planningUploads + cacheUploads);
            }
            if (this.stream && (!this.lastTelemetryUpdate || now - this.lastTelemetryUpdate > 250)) {
                const stats = this.stream.snapshot();
                const mib = bytes => (bytes / (1024 * 1024)).toFixed(1);
                const errorBound = stats.achievedErrorPixels >= 10000 ? stats.achievedErrorPixels.toExponential(1) : stats.achievedErrorPixels.toFixed(2);
                const levels = stats.lods.map(lod => lod.level);
                this.panel.text('streaming', `LOD ${Math.min(...levels)}–${Math.max(...levels)} · ${stats.residentLeafIds.length} tiles · ${stats.pending} pending · CPU ${mib(stats.budget.cpuBytes)}/${mib(stats.budget.limits.cpuBytes)} MiB · GPU est. ${mib(stats.budget.gpuBytes)}/${mib(stats.budget.limits.gpuBytes)} MiB · error bound ${errorBound}/${stats.targetErrorPixels.toFixed(1)} px · ${stats.degradationReason ?? 'ready'}`);
                this.panel.text('streaming-detail', `Loaded ${stats.loaded} · evicted ${stats.evicted} · canceled ${stats.canceled} · queue ${stats.queueDepth} · upload ${mib(stats.uploadedBytesPerFrame)} MiB/frame · stream ${stats.frameCostMs.toFixed(2)} ms`);
                const appearance = this.appearance?.snapshot();
                if (appearance) this.panel.text('appearance', `Appearance: ${appearance.residentMaskIds.length}/${appearance.maskCapacity} mask pages · ${appearance.materials.map(value => `${value.soilId}:${value.resolution}${value.micro?.shown ? '+micro' : ''}`).join(' / ')} px · multiscale ${appearance.multiscale.status} · ${appearance.pending} pending · CPU ${mib(appearance.cpuBytes)} / GPU est. ${mib(appearance.gpuBytes)} MiB · ${appearance.degradationReason ?? (appearance.settled ? 'ready' : 'streaming')}`);
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
        clearTimeout(this.capacityTimer);
        this.resizeObserver.disconnect();
        this.controls.dispose();
        this.loadingStream?.dispose();
        this.surfaceCacheRuntime?.dispose(); this.surfaceCacheRuntime = null;
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
        this.backdrop.dispose();
        this.lighting.dispose();
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
