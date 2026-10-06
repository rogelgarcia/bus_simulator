// Generates, stores and resolves the runtime surface cache: GPU atlases, page generation, residency, demand and the cached frame's uniforms.
// @ts-check
// AI577 D6 (landscape-surface-cache-v1, contract in LandscapeSurfaceCacheLayout.js; runtime landscape-surface-cache-runtime-v3 since AI577 D7: a
// viewport capacity, controller-v3, a median frame headroom, a full budget while the view shows fallback, motion bias from 16 m/s and 60 degrees per
// second, zoom prefetch). Pages are generated on the GPU by the unlit generation variant of the terrain program, which draws each rendered tile's own
// surface through a top-down orthographic projection of its page block, so every footprint-driven fade and filter evaluates for the page texel. The
// generation program has one output: it packs three bytes per float into an RGBA32F scratch of up to 64 pages, and a tiny unpack program copies each
// page into its level-0 atlas slots and box-filters it into its level-1 slots and the half-resolution response atlas, one target per draw (ANGLE's
// D3D11 backend compiles another pixel shader executable at the first draw of a multiple-output program: 5.2 s of GPU-process stall for the
// generation program, 0.5 s for a multiple-target unpack). Pages generate in blocks of up to 4x4 neighbours of one mip packed into the scratch; every
// (block, tile) pair of a frame is one pooled mesh drawn in a single render through one identity camera, with the block's world-to-clip mapping as
// its model matrix and the block's scratch rectangle as its viewport (a camera per block re-uploaded every program uniform per draw), drawing only
// the tile rows under the block. The unpack goes straight to WebGL with its own vertex array. A controller on GPU timer queries
// (LandscapeSurfaceCacheController.js) sizes each frame's batch from a fitted line of fixed and per-page cost to a target of 1 ms, less when the
// view's own frame leaves less headroom unless pages the view samples are missing (p95 objective 1.2 ms), within a bounded CPU time; missing pages
// come first (coarse and near first), then stale and provisional ones. A missing page whose inputs are still settling generates at once as a
// provisional version and is regenerated once they settled. A page publishes atomically: it renders and unpacks in one frame before the indirection
// points at the new slot, and a stale version keeps rendering until then. Invalidation is monotonic (LandscapeSurfaceCacheInputs.js): inputs that
// only coarsened never make a page stale. The deterministic CPU demand of LandscapeSurfaceCacheDemand plans the pages per camera, replanned when the
// camera moved, turned or rescaled enough, with motion and turn prefetch and a motion LOD bias. The near pass (LandscapeSurfaceCacheNearPass.js)
// evaluates the near field per pixel over the cached frame. Atlases, scratch and their framebuffers are raw WebGL2 objects (targets across texture
// levels and layers are not expressible with three.js render targets); three.js binds them through its state cache, renders into them through
// external framebuffer targets and samples them through ExternalTexture wrappers; a lost context detaches the cached frame and a restored one
// recreates them and regenerates from the root. The atlases, scratch and indirection are charged to the shared ledger under their own ceiling (the
// GPU limit less the streams' reserve).
import * as THREE from 'three';
import { createLandscapeShaderPayload, landscapeTerrainUniformVectors, landscapeTerrainVariantUniformVectors } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { LANDSCAPE_SURFACE_CACHE, fitLandscapeSurfaceCache, landscapeSurfaceCacheGeometry, landscapeSurfaceCachePageBounds, landscapeSurfaceCachePageKey, landscapeSurfaceCachePageMeters,
    landscapeSurfaceCacheSlotLayout, landscapeSurfaceCacheSlotPosition, parseLandscapeSurfaceCachePageKey, landscapeSurfaceCacheMaskLevel, landscapeSurfaceCacheHash,
    landscapeSurfaceCacheScratchLayout, packLandscapeSurfaceCacheBlocks, landscapeSurfaceCacheBlockPageOrigin, landscapeSurfaceCacheTexelMeters } from './LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_SURFACE_CACHE_DEMAND, chooseLandscapeSurfaceCacheCenter, createLandscapeSurfaceCacheTerrainEnvelope, mergeLandscapeSurfaceCacheFeedback, planLandscapeSurfaceCacheDemand } from './LandscapeSurfaceCacheDemand.js';
import { LandscapeSurfaceCacheIndirection, LandscapeSurfaceCacheResidency } from './LandscapeSurfaceCacheResidency.js';
import { LANDSCAPE_SURFACE_CACHE_INPUTS, indexLandscapeSurfaceCacheInputs, landscapeSurfaceCacheGlobalKey, landscapeSurfaceCacheInputChange, landscapeSurfaceCachePageInputs,
    landscapeSurfaceCacheSoilTiers, landscapeSurfaceCacheTierRank } from './LandscapeSurfaceCacheInputs.js';
import { LANDSCAPE_SURFACE_CACHE_CONTROLLER, fitLandscapeSurfaceCacheCost, landscapeSurfaceCacheBatchCost, landscapeSurfaceCacheGenerationTarget,
    nextLandscapeSurfaceCacheQuota } from './LandscapeSurfaceCacheController.js';
import { landscapeCameraSnapshot } from './LandscapeStreamer.js';
import { LandscapeSurfaceCacheNearPass } from './LandscapeSurfaceCacheNearPass.js';
import { landscapeSurfaceCacheNearBand } from './LandscapeSurfaceCacheNearField.js';

export const LANDSCAPE_SURFACE_CACHE_RUNTIME = Object.freeze({
    id: 'landscape-surface-cache-runtime-v3',
    // generation budget: a batch targets generationBudgetMs of GPU time, less when the view's own frame leaves less headroom below the frame period
    // (the measured main frame plus frameMarginMs), never below generationFloorMs; generationLimitMs is the per-batch ceiling the controller defends
    // (its p95 objective): the quota is the page count whose fitted cost (fixed + per page over the last quotaWindow batches, plus their residual
    // spread) meets the target and whose 95th percentile fits under the ceiling (LandscapeSurfaceCacheController.js), cut at once to 70% when a
    // batch's own GPU time exceeds the ceiling, growing by 25% (at least two pages) per timed batch
    generationBudgetMs: 1,
    generationLimitMs: 1.2,
    generationFloorMs: .3,
    framePeriodMs: 1000 / 60,
    frameMarginMs: 2,
    // AI577 D7: the headroom is judged on the median GPU time of the view's last frameWindow frames (one slow frame, such as another process's GPU
    // work, held the target at its floor for 80 frames in a 5 m/s walk while pages went missing), and while pages the current view samples are
    // missing (coarser fallback on screen) the target is the whole budget (fallbackFloorMs): at 3840x2160 a view's own frame takes 15-27 ms (the near
    // pass draws most of the lower screen), so the headroom held the target at its floor and a batch's fixed part (0.4 ms with a 48-layer atlas) left
    // room for one to five pages per frame while up to 290 (walking) and 244 (15 m/s, measured with a 0.6 ms floor) pages the view samples were
    // missing; a frame already past the frame period gains nothing from a smaller batch
    frameWindow: 30,
    fallbackFloorMs: 1,
    initialQuota: 8,
    quotaWindow: 24,
    quotaGrowth: 1.25,
    quotaCut: .7,
    maximumPagesPerFrame: LANDSCAPE_SURFACE_CACHE.generationBatch,
    // a page found unstable (inputs fading or in transition) is not examined again for this many frames unless its inputs change
    unstableRecheckFrames: 6,
    // motion bias of the demand: above biasSpeed (or biasTurnSpeed while turning) the refinement footprint grows by (speed / biasSpeed) up to
    // 2^maxBias (one mip coarser at twice the speed), so fast flight and fast pans request a coherent coarser ring the generation keeps up with
    // instead of a patchwork of missing pages over coarser ancestors; it relaxes at biasRelaxPerSecond mips per second once the camera slows.
    // AI577 D7: 16 m/s and 60 degrees per second at 1920x1080 (D6: 6 m/s and 30): the bias coarsens the whole frame, one full mip from 12 m/s and 60
    // degrees per second at the D6 thresholds, while the controller-v3 generation keeps up with walking, 15 m/s flight and 45 degree per second turns.
    // Finer drawing buffers divide both thresholds by the square root of their pixels over 1920x1080 (3840x2160: 8 m/s and 30 degrees per second):
    // the pages a motion uncovers grow with the pixels, and at 3840x2160 a 15 m/s flight left up to 1,353 pages missing at full detail
    biasSpeed: 16,
    biasTurnSpeed: 60 * Math.PI / 180,
    biasReferencePixels: 1920 * 1080,
    maxBias: 1,
    biasRelaxPerSecond: 2,
    cpuBudgetMs: 4,
    // identity checks of dirty resident pages per frame, and their CPU time limit
    identityChecksPerFrame: 160,
    identityCheckMs: .3,
    demandRefreshFrames: 30,
    // the demand replans when the camera moved a mip-0 page (or a quarter of the finest desired page) or turned four degrees since the last plan,
    // every few frames while it moves less, and whenever the projection changes; between plans the motion prefetch of the last plan (half a second
    // ahead) covers the movement, and above 10 degrees per second a turn prefetch plans the view the camera turns towards a quarter of a second
    // ahead (at most 20 degrees); a pixel footprint scale change (zoom, field of view) replans beyond 3% (0.04 mips)
    replanMoveMeters: 1,
    replanTurnRadians: 4 * Math.PI / 180,
    replanScaleRatio: .03,
    replanFrames: 4,
    turnPrefetchSeconds: .25,
    turnPrefetchMaxRadians: 20 * Math.PI / 180,
    turnPrefetchMinimumSpeed: 10 * Math.PI / 180,
    // AI577 D7: a perspective camera zooming in faster than zoomPrefetchMinimumRate (natural log of its pixel footprint per second) also plans the
    // view with that footprint extrapolated zoomPrefetchSeconds ahead (at most zoomPrefetchMaxRatio of the current footprint, one mip), so the finer
    // rings a zoom is about to need generate before they show
    zoomPrefetchSeconds: .5,
    zoomPrefetchMinimumRate: .1,
    zoomPrefetchMaxRatio: .5,
    compileWaitMs: 60000,
    programCache: 3,
    heightRangeMeters: Object.freeze([-2000, 8000]),
    // packed neutral texel of scratch areas without terrain (beyond the landscape): sRGB gray albedo, AO 1, the geometric normal, roughness 0.9,
    // no micro coverage or reach, a grass-like response
    neutral: Object.freeze([124 + 124 * 256 + 124 * 65536, 255 + 128 * 256 + 128 * 65536, 230, 77 + 255 * 256 + 77 * 65536]),
    modes: Object.freeze(['off', 'on'])
});

/** Snapshot of a view without a surface cache. */
export const LANDSCAPE_SURFACE_CACHE_OFF = Object.freeze({ recipe: LANDSCAPE_SURFACE_CACHE.id, status: 'off', reason: 'surface-cache-off', ready: false, settled: true });

/**
 * Whether a surface cache can run, decided before anything is allocated: the device checks and the atlas fit against the ledger. headroom false
 * judges the budget profile alone (the ledger's limits, not its current use): a view choosing its tiles' program variant asks before the streams it
 * replaces have released their bytes, and the cache constructor checks the headroom again when it allocates.
 * @param {{renderer:any,budget:any,bounds:{minX:number,maxX:number,minZ:number,maxZ:number},coverageSlots:number,targetSlots?:number,windowPages?:number,headroom?:boolean}} options
 *   targetSlots and windowPages are the capacity (landscapeSurfaceCacheCapacity of the view's drawing buffer)
 * @returns {{admitted:boolean,reason:string|null,fit:any}} reason also names the degradation of an admitted atlas (null when it fits its target)
 */
export function landscapeSurfaceCacheAdmission({ renderer, budget, bounds, coverageSlots, targetSlots = LANDSCAPE_SURFACE_CACHE.targetSlots, windowPages = LANDSCAPE_SURFACE_CACHE.windowPages, headroom = true }) {
    const gl = renderer.getContext();
    const shared = landscapeTerrainUniformVectors(), variant = landscapeTerrainVariantUniformVectors().variantVectors;
    if (!renderer.capabilities.isWebGL2) return { admitted: false, reason: 'surface-cache-device-webgl2', fit: null };
    if (shared.fixedVectors + variant + coverageSlots * shared.slotVectors > renderer.capabilities.maxFragmentUniforms) return { admitted: false, reason: 'surface-cache-device-uniforms', fit: null };
    if (!gl.getExtension('EXT_color_buffer_float')) return { admitted: false, reason: 'surface-cache-device-float-target', fit: null };
    const ledger = budget.snapshot();
    const fit = fitLandscapeSurfaceCache({ limits: ledger.limits, available: headroom ? { gpuBytes: ledger.limits.gpuBytes - ledger.gpuBytes } : null,
        geometry: landscapeSurfaceCacheGeometry(bounds, { windowPages }), targetSlots, maxTextureSize: renderer.capabilities.maxTextureSize, maxArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) });
    return { admitted: fit.slots > 0, reason: fit.reason, fit };
}

const RUNTIME = LANDSCAPE_SURFACE_CACHE_RUNTIME;
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
const cpuWindow = samples => {
    const values = [...samples].filter(Number.isFinite).sort((a, b) => a - b);
    return { frames: values.length, medianMs: values[Math.floor(values.length / 2)] ?? null, p95Ms: values[Math.floor(values.length * .95)] ?? null, maxMs: values.at(-1) ?? null };
};

export class LandscapeSurfaceCache {
    /**
     * @param {{renderer:any,budget:any,loaded:any,coverageSlots:number,targetSlots?:number,windowPages?:number,capacityReason?:string|null,anisotropy?:number,
     *   near?:{mode?:'on'|'off',startTexels?:number,endTexels?:number}}} options
     *   budget is the shared residency ledger; loaded the landscape overview (bounds, root heights); coverageSlots the compiled coverage slot count of the
     *   view's terrain programs; targetSlots and windowPages the capacity (AI577 D7, landscapeSurfaceCacheCapacity) and capacityReason its degradation
     *   (surface-cache-viewport-capacity beyond the policy's limits); near the near pass mode and hand-over band (landscape-surface-cache-near-v1)
     */
    constructor({ renderer, budget, loaded, coverageSlots, targetSlots = LANDSCAPE_SURFACE_CACHE.targetSlots, windowPages = LANDSCAPE_SURFACE_CACHE.windowPages,
        capacityReason = null, anisotropy = LANDSCAPE_SURFACE_CACHE.maxAnisotropy, near = {} }) {
        if (![1, 2, 4, 8, 16].includes(anisotropy)) throw new Error(`[LandscapeSurfaceCache] anisotropy must be 1, 2, 4, 8 or 16; received ${anisotropy}`);
        Object.assign(this, { renderer, budget, loaded, anisotropy, coverageSlots, capacityReason });
        this.nearOptions = { mode: near.mode ?? 'on', band: landscapeSurfaceCacheNearBand({ startTexels: near.startTexels, endTexels: near.endTexels }), texels: { startTexels: near.startTexels, endTexels: near.endTexels } };
        this.near = null;
        this.prefix = `surface-cache/${crypto.randomUUID()}`;
        this.geometry = landscapeSurfaceCacheGeometry(loaded.manifest.bounds, { windowPages });
        this.bounds = loaded.manifest.bounds;
        this.envelope = createLandscapeSurfaceCacheTerrainEnvelope(loaded.chunk);
        this.status = 'unavailable';
        this.reason = null;
        this.disposed = false;
        this.frame = 0;
        this.demandSeq = 0;
        this.center = null;
        this.globalKey = null;
        this.desired = [];
        this.carried = [];
        this.unstable = new Map();
        this.dirty = new Set();
        this.slotState = new Map();
        this.tokens = new Map();
        // generation draws: one pooled mesh per (block, tile) pair of a frame, all drawn through one identity camera (see #render)
        this.drawPool = [];
        this.feedback = [];
        // CPU time of the last 120 updates (demand, identities, generation submission, indirection upload)
        this.cpuSamples = new Float64Array(120).fill(NaN);
        this.stats = { dirtyBy: { tiles: 0, masks: 0, soils: 0, fields: 0, global: 0 }, staleBy: { global: 0, tiles: 0, masks: 0, soils: 0 }, staleMarked: 0, keptCoarser: 0,
            provisionalGenerated: 0, pagesGenerated: 0, pagesLastFrame: 0, regenerated: 0, framesWithGeneration: 0, unstableSkips: 0, capacityStops: 0, flushes: 0, evictions: 0, cpuMs: 0, generationCpuMs: 0,
            demandMs: 0, demandUpdates: 0, identityChecks: 0, uploadBytes: 0, clearedBlocks: 0, peakGenerationCpuMs: 0, rootGeneratedAtMs: null, createdAtMs: performance.now() };
        this.gpu = { samples: [], window: [], unpacks: [], model: null, perPageMs: null, quota: RUNTIME.initialQuota, pending: [], lastMs: null, maxMs: 0, disjoint: 0, supported: false,
            spikes: 0, external: 0, externalMs: 0 };
        // GPU time of the view's recent frames (median for the generation headroom)
        this.frameSamples = new Float64Array(RUNTIME.frameWindow).fill(NaN);
        this.program = { key: null, material: null, ready: false, milliseconds: null, timedOut: false, started: 0, compiles: 0 };
        // linked generation programs by key (at most RUNTIME.programCache): a program variant switched back (an A/B toggle) reuses its linked program
        this.programs = new Map();
        const gl = renderer.getContext();
        const admission = landscapeSurfaceCacheAdmission({ renderer, budget, bounds: this.bounds, coverageSlots, targetSlots, windowPages });
        this.fit = admission.fit;
        if (!admission.admitted) { this.reason = admission.reason; return; }
        this.atlasKey = `${this.prefix}/atlas`;
        this.indirectionKey = `${this.prefix}/indirection`;
        // the atlases plus the packed generation scratch
        const atlas = budget.reserve(this.atlasKey, { cpuBytes: 0, gpuBytes: this.fit.atlasBytes + this.fit.scratchBytes, kind: 'appearance-surface-cache-atlas' });
        if (!atlas.admitted) { this.reason = `surface-cache-${atlas.reason}`; return; }
        const indirection = budget.reserve(this.indirectionKey, { cpuBytes: this.fit.cpuBytes, gpuBytes: this.fit.indirectionBytes, kind: 'appearance-surface-cache-indirection' });
        if (!indirection.admitted) { budget.release(this.atlasKey); this.reason = `surface-cache-${indirection.reason}`; return; }
        this.layout = landscapeSurfaceCacheSlotLayout({ slots: this.fit.slots });
        this.#createAtlases(gl);
        this.residency = new LandscapeSurfaceCacheResidency({ slots: this.layout.slots });
        this.indirection = new LandscapeSurfaceCacheIndirection({ geometry: this.geometry });
        this.indirectionTexture = new THREE.DataArrayTexture(this.indirection.data, this.geometry.windowPages, this.geometry.windowPages, this.geometry.mips);
        Object.assign(this.indirectionTexture, { format: THREE.RGBAIntegerFormat, type: THREE.UnsignedByteType, internalFormat: 'RGBA8UI', magFilter: THREE.NearestFilter,
            minFilter: THREE.NearestFilter, generateMipmaps: false, flipY: false });
        this.indirectionTexture.needsUpdate = true;
        this.indirectionUploaded = false;
        this.scene = new THREE.Scene();
        this.scene.matrixWorldAutoUpdate = false;
        this.generationCamera = new THREE.Camera();
        this.poolGeometry = new THREE.BufferGeometry();
        this.#createUnpack();
        this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        this.gpu.supported = !!this.timer;
        // the atlases, scratch, framebuffers and unpack buffers are raw WebGL objects three.js cannot restore: a lost context detaches the cached
        // frame (the terrain draws the bootstrap) and a restored one recreates them and regenerates from the root (#contextRestored)
        this.lost = false;
        this.onContextLost = () => this.#contextLost();
        this.onContextRestored = () => this.#contextRestored();
        renderer.domElement?.addEventListener?.('webglcontextlost', this.onContextLost);
        renderer.domElement?.addEventListener?.('webglcontextrestored', this.onContextRestored);
        this.status = 'waiting';
        this.reason = 'surface-cache-unbound';
    }

    #contextLost() {
        if (!this.available) return;
        this.lost = true;
        this.stats.contextLosses = (this.stats.contextLosses ?? 0) + 1;
        this.gpu.pending = [];
        this.near?.disable(this.appearance?.uniforms);
        const u = this.appearance?.uniforms;
        if (u) {
            u.uSurfaceCacheState.value.x = 0;
            u.uSurfaceCacheAlbedo.value = u.uSurfaceCacheMaterial.value = u.uSurfaceCacheResponse.value = null;
            if (u.uSurfaceCacheIndirection.value === this.indirectionTexture) u.uSurfaceCacheIndirection.value = this.placeholder ?? u.uSurfaceCacheIndirection.value;
        }
        this.status = 'lost';
        this.reason = 'surface-cache-context-lost';
    }

    // three.js restored its own state first (its listener was registered with the renderer); the cache's raw objects are recreated empty, every
    // page is forgotten and the programs compile again, so the cache starts over from the root page like a new binding
    #contextRestored() {
        if (!this.available || !this.lost) return;
        const gl = this.renderer.getContext();
        this.#createAtlases(gl);
        this.unpackMaterial.uniforms.uSurfaceCacheScratch.value = this.scratchExternal;
        this.unpackBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.unpackBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.unpackData.byteLength, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.unpackVao = null;
        this.unpackGl = null;
        this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        this.gpu.supported = !!this.timer;
        this.gpu.pending = [];
        this.#clearPool();
        for (const entry of this.programs.values()) entry.material.dispose();
        this.programs.clear();
        this.program = { key: null, material: null, ready: false, milliseconds: null, timedOut: false, started: 0, compiles: this.program.compiles };
        if (this.near && this.stream) {
            this.near.dispose(this.appearance?.uniforms);
            this.near = new LandscapeSurfaceCacheNearPass({ renderer: this.renderer, scene: this.stream.scene, band: this.nearOptions.band, mode: this.nearOptions.mode });
        }
        this.residency.clear();
        this.indirection.reset();
        this.indirectionTexture.needsUpdate = true;
        this.indirectionUploaded = false;
        this.carried = []; this.unstable.clear(); this.dirty.clear(); this.desired = []; this.feedback = []; this.lastCamera = null; this.center = null; this.globalKey = null;
        this.lost = false;
        this.stats.contextRestores = (this.stats.contextRestores ?? 0) + 1;
        this.stats.restoredAtMs = performance.now();
        this.stats.rootGeneratedAtMs = null;
        this.status = 'waiting';
        this.reason = 'surface-cache-context-restored';
    }

    get available() { return !!this.layout && !this.disposed; }

    // three texture arrays (albedo + AO sRGB and material at levels 0-1, response at half resolution) with one framebuffer per layer and level, the
    // packed float generation scratch, and an external-framebuffer render target per framebuffer for three.js
    #createAtlases(gl) {
        const state = this.renderer.state, layout = this.layout, anisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
        const create = (target, internalFormat, size, levels, layers, filter) => {
            const texture = gl.createTexture();
            state.bindTexture(target, texture);
            if (target === gl.TEXTURE_2D_ARRAY) gl.texStorage3D(target, levels, internalFormat, size, size, layers); else gl.texStorage2D(target, levels, internalFormat, size, size);
            gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter === 'nearest' ? gl.NEAREST : levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
            gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter === 'nearest' ? gl.NEAREST : gl.LINEAR);
            gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(target, gl.TEXTURE_BASE_LEVEL, 0);
            gl.texParameteri(target, gl.TEXTURE_MAX_LEVEL, levels - 1);
            if (filter !== 'nearest' && anisotropic && this.anisotropy > 1) gl.texParameterf(target, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(this.anisotropy, gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
            state.unbindTexture();
            return texture;
        };
        const framebuffer = (attachments, size) => {
            const object = gl.createFramebuffer();
            state.bindFramebuffer(gl.FRAMEBUFFER, object);
            attachments.forEach(([texture, level, layer], index) => {
                if (layer === null) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture, level);
                else gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, texture, level, layer);
            });
            gl.drawBuffers(attachments.map((_, index) => gl.COLOR_ATTACHMENT0 + index));
            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            state.bindFramebuffer(gl.FRAMEBUFFER, null);
            if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`[LandscapeSurfaceCache] cache framebuffer of ${attachments.length} targets is incomplete (0x${status.toString(16)})`);
            const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
            this.renderer.setRenderTargetFramebuffer(target, object);
            target.viewport.set(0, 0, size, size);
            target.scissor.set(0, 0, size, size);
            target.scissorTest = false;
            return { framebuffer: object, target, size };
        };
        this.glTextures = { albedo: create(gl.TEXTURE_2D_ARRAY, gl.SRGB8_ALPHA8, layout.layerTexels, 2, layout.layers), material: create(gl.TEXTURE_2D_ARRAY, gl.RGBA8, layout.layerTexels, 2, layout.layers),
            response: create(gl.TEXTURE_2D_ARRAY, gl.RGBA8, layout.responseTexels, 1, layout.layers) };
        const scratch = landscapeSurfaceCacheScratchLayout();
        this.scratchTexture = create(gl.TEXTURE_2D, gl.RGBA32F, scratch.texels, 1, 1, 'nearest');
        this.anisotropySupported = !!anisotropic;
        this.textures = Object.fromEntries(Object.entries(this.glTextures).map(([name, texture]) => [name, new THREE.ExternalTexture(texture)]));
        this.scratchExternal = new THREE.ExternalTexture(this.scratchTexture);
        this.scratch = framebuffer([[this.scratchTexture, 0, null]], scratch.texels);
        this.clearRect = new THREE.Vector4();
        // per layer and level, one single-target framebuffer per format the unpack writes: [albedo, material] at level 0, [albedo, material, response] at level 1
        this.framebuffers = [];
        for (let layer = 0; layer < layout.layers; layer++) {
            this.framebuffers.push([
                [framebuffer([[this.glTextures.albedo, 0, layer]], layout.layerTexels), framebuffer([[this.glTextures.material, 0, layer]], layout.layerTexels)],
                [framebuffer([[this.glTextures.albedo, 1, layer]], layout.levelOneTexels), framebuffer([[this.glTextures.material, 1, layer]], layout.levelOneTexels),
                    framebuffer([[this.glTextures.response, 0, layer]], layout.responseTexels)]
            ]);
        }
    }

    // the unpack program: one quad per page over its destination slot, all pages of an atlas layer and level in one draw per target format. three.js
    // compiles and links it; the draws go straight to WebGL with the cache's own vertex array (interleaved clip-space corner, scratch and slot origins
    // per vertex), so a batch costs a few GL calls per layer instead of a renderer pass per page or per target
    #createUnpack() {
        const payload = createLandscapeShaderPayload('surface-cache-unpack');
        this.unpackMaterial = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource,
            uniforms: { uSurfaceCacheScratch: { value: this.scratchExternal }, uSurfaceCacheTarget: { value: 0 }, uSurfaceCacheLevel: { value: 0 } }, depthTest: false, depthWrite: false });
        attachShaderMetadata(this.unpackMaterial, payload);
        // the compile probe: a mesh with the program's attribute layout
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
        geometry.setAttribute('aSurfaceCacheOrigins', new THREE.BufferAttribute(new Float32Array(12), 4));
        this.unpackCamera = new THREE.Camera();
        this.unpackMesh = new THREE.Mesh(geometry, this.unpackMaterial);
        this.unpackMesh.frustumCulled = false;
        this.unpackScene = new THREE.Scene();
        this.unpackScene.matrixWorldAutoUpdate = false;
        this.unpackScene.add(this.unpackMesh);
        const gl = this.renderer.getContext();
        this.unpackData = new Float32Array(LANDSCAPE_SURFACE_CACHE.generationBatch * 6 * 6);
        this.unpackBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.unpackBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.unpackData.byteLength, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.unpackVao = null;
    }

    // the linked unpack program's handles and the vertex array bound to its attribute locations (once the program is linked)
    #unpackProgram(gl) {
        if (this.unpackVao) return this.unpackGl;
        const program = this.renderer.properties.get(this.unpackMaterial).currentProgram?.program;
        if (!program) throw new Error('[LandscapeSurfaceCache] the unpack program is not compiled');
        const position = gl.getAttribLocation(program, 'position'), origins = gl.getAttribLocation(program, 'aSurfaceCacheOrigins');
        this.unpackVao = gl.createVertexArray();
        gl.bindVertexArray(this.unpackVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.unpackBuffer);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(origins);
        gl.vertexAttribPointer(origins, 4, gl.FLOAT, false, 24, 8);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.unpackGl = { program, scratch: gl.getUniformLocation(program, 'uSurfaceCacheScratch'), target: gl.getUniformLocation(program, 'uSurfaceCacheTarget'),
            level: gl.getUniformLocation(program, 'uSurfaceCacheLevel') };
        return this.unpackGl;
    }

    /** Whether a load can rebind this cache: the same landscape extent (the virtual texture frame) while the cache is usable. @param {any} loaded */
    canRebind(loaded) {
        const a = loaded?.manifest?.bounds, b = this.bounds;
        return this.available && !this.lost && !!a && a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
    }

    /**
     * Binds the cache to the streams of one load; a new binding flushes every page (their identities belong to the previous load). A reload of the
     * same landscape passes its overview (`loaded`): the atlases, the linked generation and near programs and the near pass carry over, so a reload
     * (an edit's recovery) regenerates pages without reallocating or relinking anything.
     * @param {{stream:any,appearance:any,loaded?:any}} binding
     */
    bind({ stream, appearance, loaded = null }) {
        if (!this.available) { appearance.surfaceCache = this; return; }
        if (loaded && loaded !== this.loaded) {
            if (!this.canRebind(loaded)) throw new Error('[LandscapeSurfaceCache] a rebinding load must cover the same landscape extent');
            this.loaded = loaded;
            this.envelope = createLandscapeSurfaceCacheTerrainEnvelope(loaded.chunk);
        }
        this.#detach();
        this.stream = stream;
        this.appearance = appearance;
        appearance.surfaceCache = this;
        this.near ??= new LandscapeSurfaceCacheNearPass({ renderer: this.renderer, scene: stream.scene, band: this.nearOptions.band, mode: this.nearOptions.mode });
        this.near.scene = stream.scene;
        this.placeholder = null;
        this.residency.clear();
        this.carried = []; this.unstable.clear(); this.dirty.clear(); this.slotState.clear(); this.desired = []; this.feedback = []; this.lastCamera = null; this.lastNearStart = 0;
        this.soilTiers = null; this.transitionKey = null; this.levelSpacingKey = null; this.byLevel = null; this.indexed = null;
        this.leafIds = null; this.leafSources = null; this.overviewSources = null;
        this.globalKey = null;
        this.center = null;
        this.indirection.reset();
        this.status = 'waiting';
        this.reason = 'surface-cache-appearance-pending';
        this.#syncUniforms();
    }

    // releases the current binding's uniforms, draws and per-load state; programs, atlases and the near pass stay for the next binding
    #detach() {
        this.near?.disable(this.appearance?.uniforms);
        if (this.appearance) {
            const u = this.appearance.uniforms;
            u.uSurfaceCacheState.value.x = 0;
            u.uSurfaceCacheAlbedo.value = u.uSurfaceCacheMaterial.value = u.uSurfaceCacheResponse.value = null;
            if (u.uSurfaceCacheIndirection.value === this.indirectionTexture) u.uSurfaceCacheIndirection.value = this.placeholder ?? u.uSurfaceCacheIndirection.value;
            if (this.appearance.surfaceCache === this) this.appearance.surfaceCache = null;
        }
        this.#clearPool();
        this.stream = null;
        this.appearance = null;
    }

    unbind() {
        this.#detach();
        this.near?.dispose();
        this.near = null;
        for (const entry of this.programs.values()) entry.material.dispose();
        this.programs.clear();
        this.program = { key: null, material: null, ready: false, milliseconds: null, timedOut: false, started: 0, compiles: this.program.compiles };
    }

    get ready() { return !!this.residency?.get(landscapeSurfaceCachePageKey(this.geometry.rootMip, 0, 0)); }

    // the unlit generation variant of the view's terrain program, sharing the overview tile's uniform cells (every tile's appearance, lighting and
    // planning cells are the same objects); it compiles through KHR_parallel_shader_compile while the page keeps drawing. Linked programs stay by
    // key, and a new load's uniform cells re-initialize the same linked program (three.js reuses it for equal parameters) instead of relinking it
    #ensureProgram() {
        const stream = this.stream, root = stream.surfaceCacheTiles().root;
        if (!root) return false;
        const variant = stream.programVariant, key = `${stream.coverageSlots}|${stream.materialSampling}|${stream.lightingTier}|${variant.terrainAppearance}`;
        const uniforms = root.mesh.material.uniforms;
        if (this.program.key !== key) {
            this.#clearPool();
            let entry = this.programs.get(key);
            if (!entry) {
                entry = this.#compileProgram(key, root, variant);
                this.programs.set(key, entry);
                for (const [old, cached] of this.programs) if (this.programs.size > RUNTIME.programCache && old !== key) { cached.material.dispose(); this.programs.delete(old); }
            }
            this.program = entry;
            this.globalKey = null;
        }
        if (this.program.uniforms !== uniforms) {
            // three.js keeps the uniform cells a material had when it first linked (or reused) its program, so the cells of another load need another
            // material: it reuses the linked program by key, and the previous material is released once the new one holds the program
            const previous = this.program.material;
            this.program.material = this.#generationMaterial(this.program.payload, uniforms);
            this.#acquireProgram(this.program.material, root);
            previous.dispose();
            this.program.uniforms = uniforms;
        }
        if (!this.program.ready) {
            const program = this.renderer.properties.get(this.program.material).currentProgram;
            const elapsed = performance.now() - this.program.started;
            if (program?.isReady() || elapsed > RUNTIME.compileWaitMs) {
                this.program.ready = true;
                this.program.milliseconds = elapsed;
                this.program.timedOut = !program?.isReady();
            } else { this.status = 'compiling'; this.reason = 'surface-cache-generation-program'; }
        }
        return this.program.ready;
    }

    #compileProgram(key, root, variant) {
        const stream = this.stream;
        const payload = createLandscapeShaderPayload('terrain', { coverageSlots: stream.coverageSlots, materialSampling: stream.materialSampling, lightingTier: stream.lightingTier,
            terrainAppearance: variant.terrainAppearance, surfaceCacheGeneration: true });
        const material = this.#generationMaterial(payload, root.mesh.material.uniforms);
        this.#acquireProgram(material, root);
        this.renderer.setRenderTarget(this.framebuffers[0][0][0].target);
        this.renderer.compile(this.unpackScene, this.unpackCamera);
        this.renderer.setRenderTarget(null);
        this.renderer.getContext().flush();
        this.programCompiles = (this.programCompiles ?? 0) + 1;
        return { key, payload, uniforms: root.mesh.material.uniforms, material, ready: false, milliseconds: null, timedOut: false, started: performance.now(), compiles: this.programCompiles };
    }

    #generationMaterial(payload, uniforms) {
        const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true, uniforms,
            side: THREE.DoubleSide, depthTest: false, depthWrite: false });
        attachShaderMetadata(material, payload);
        return material;
    }

    // links (or, for a program already linked under the same key, reuses) the material's program on an unrendered probe of the overview tile, drawn
    // into the scratch as the generation draws are
    #acquireProgram(material, root) {
        const probe = new THREE.Mesh(root.mesh.geometry, material);
        probe.frustumCulled = false;
        const scene = new THREE.Scene();
        scene.add(probe);
        this.renderer.setRenderTarget(this.scratch.target);
        this.renderer.compile(scene, this.generationCamera);
        this.renderer.setRenderTarget(null);
        scene.remove(probe);
    }

    /**
     * One frame: demand, identity refresh, generation within its GPU and CPU budgets, indirection upload and the frame uniforms. Called before the
     * view renders, after the geometry and appearance streams updated.
     * @param {{dt:number,camera:any,viewportHeight:number,viewportWidth?:number|null,uploadAllowance?:number,frameGpuMs?:number|null}} frame frameGpuMs is the GPU time
     *   of the view's last completed frame (null when unknown); the median of the recent frames' values sizes the generation budget's headroom;
     *   viewportWidth (drawing-buffer pixels, with viewportHeight) scales the motion bias thresholds
     * @returns {number} uploaded bytes
     */
    update({ dt, camera, viewportHeight, viewportWidth = null, uploadAllowance = Infinity, frameGpuMs = null }) {
        const started = performance.now();
        this.frame++;
        this.biasScale = Math.sqrt(Math.max(1, (viewportWidth ?? 0) * viewportHeight / RUNTIME.biasReferencePixels));
        if (Number.isFinite(frameGpuMs)) this.frameSamples[this.frame % this.frameSamples.length] = frameGpuMs;
        const frames = this.frameSamples.filter(Number.isFinite).sort();
        this.lastFrameGpuMs = Number.isFinite(frameGpuMs) ? frameGpuMs : null;
        this.frameGpuMs = frames.length ? frames[Math.floor(frames.length / 2)] : null;
        this.stats.pagesLastFrame = 0;
        this.stats.blocksLastFrame = 0;
        this.stats.uploadBytes = 0;
        if (!this.available || this.lost) return 0;
        this.#pollTimer();
        if (!this.stream || !this.appearance) return 0;
        const appearance = this.appearance;
        if (!appearance.initialized || appearance.uniforms.uAppearanceReady.value !== 1) { this.near?.disable(appearance.uniforms); this.status = 'waiting'; this.reason = 'surface-cache-appearance-pending'; return 0; }
        // the near program links beside the generation program (both through KHR_parallel_shader_compile), not after the root page: on a fresh
        // browser profile the settled view otherwise waits for the two links in sequence
        if (this.near && !this.near.program.ready) this.near.prewarm({ stream: this.stream, root: this.stream.surfaceCacheTiles().root, camera });
        if (!this.#ensureProgram()) { this.near?.disable(appearance.uniforms); return 0; }
        const steps = this.stats.steps = {};
        let mark = performance.now();
        const step = name => { const now = performance.now(); steps[name] = now - mark; mark = now; };
        this.tiles = this.stream.surfaceCacheTiles();
        this.#diffTiles();
        step('tiles');
        const inputs = appearance.surfaceCacheInputs();
        const container = this.program.uniforms;
        const global = landscapeSurfaceCacheGlobalKey({ ...inputs.global, program: this.program.key, sea: container.uLandscapeSun.value.w, rockGate: container.uLandscapeResponse.value.w });
        if (global !== this.globalKey) {
            if (this.globalKey !== null) { this.stats.flushes++; this.stats.dirtyBy.global += this.residency.pages.size; this.stats.staleBy.global += this.residency.pages.size; }
            for (const record of this.residency.pages.values()) record.stale = true;
            this.globalKey = global;
        }
        this.inputs = inputs;
        step('inputs');
        // the page-query index rebuilds when mask pages arrived, left or changed key; otherwise only the fade progress of its entries updates
        if (this.#diffInputs(inputs) || !this.byLevel) {
            this.byLevel = indexLandscapeSurfaceCacheInputs({ slots: inputs.slots.map(slot => ({ ...slot, key: this.#token(slot.key) })), levelSpacings: inputs.levelSpacings });
            this.indexed = new Map(this.byLevel.flat().map(entry => [entry.id, entry]));
        } else for (const slot of inputs.slots) this.indexed.get(slot.id).progress = slot.progress;
        step('diff');
        const snapshot = landscapeCameraSnapshot(camera, viewportHeight);
        const nearStart = this.near?.active ? this.near.band.start : 0;
        if (this.#replanNeeded(snapshot, nearStart)) this.#plan(snapshot, camera, viewportHeight, nearStart);
        step('plan');
        this.#refreshIdentities(inputs);
        step('identities');
        this.#generate(inputs, started);
        step('generate');
        const rebuilt = this.indirection.rebuild((mip, x, z) => this.residency.slotOf(mip, x, z));
        const uploaded = this.#upload(rebuilt);
        this.stats.uploadOverAllowance = uploaded > uploadAllowance;
        this.#syncUniforms();
        step('indirection');
        // the near pass draws while the tiles draw the cached frame program over a ready cache (not in wireframe inspection)
        const variant = this.stream.programVariant;
        this.near.update({ stream: this.stream, tiles: this.tiles, camera, snapshot, anisotropy: this.anisotropy, uniforms: appearance.uniforms,
            enabled: this.ready && this.indirectionUploaded && variant.surfaceCache && !variant.diagnostics && this.stream.mode !== 'wireframe' });
        step('near');
        this.status = this.ready ? 'active' : 'bootstrap';
        this.reason = this.ready ? (this.capacityLimited ? 'surface-cache-capacity' : this.fit.reason ?? this.capacityReason) : 'surface-cache-root-pending';
        this.stats.cpuMs = performance.now() - started;
        this.cpuSamples[this.frame % this.cpuSamples.length] = this.stats.cpuMs;
        return uploaded;
    }

    #token(key) {
        let token = this.tokens.get(key);
        if (!token) { token = landscapeSurfaceCacheHash(key); this.tokens.set(key, token); }
        return token;
    }

    // input changes that can make a resident page stale (monotonic invalidation) mark the pages they reach for an identity check: mask pages that
    // appeared or changed key (pages at the mips whose texel still resolves their level, within the warp and kernel margin), and soils whose material
    // or micro tier became finer at a page's mip (pages holding the soil). Removals, downgrades, fade progress and tier transitions change no page
    // that was generated from settled inputs; with any of them the pages waiting for unsettled inputs are examined again at once. Returns whether
    // the set of mask pages changed (the page-query index rebuilds)
    #diffInputs(inputs) {
        const next = new Map(), changed = [];
        let settling = false, removed = false;
        for (const slot of inputs.slots) {
            next.set(slot.id, slot);
            const previous = this.slotState.get(slot.id);
            if (!previous || previous.key !== slot.key) changed.push(slot);
            else if ((previous.progress === 1) !== (slot.progress === 1)) settling = true;
        }
        if (next.size !== this.slotState.size + changed.filter(slot => !this.slotState.has(slot.id)).length) removed = true;
        this.slotState = next;
        const spacings = inputs.levelSpacings.join(','), structural = changed.length > 0 || removed || spacings !== this.levelSpacingKey;
        this.levelSpacingKey = spacings;
        const transitionKey = inputs.soils.map(soil => soil.transitionResolution).join(',');
        if (structural || settling || transitionKey !== this.transitionKey) this.unstable.clear();
        this.transitionKey = transitionKey;
        this.#diffSoils(inputs.soils);
        if (inputs.fieldsFading !== this.fieldsFading) { this.fieldsFading = inputs.fieldsFading; for (const key of this.residency.pages.keys()) this.dirty.add(key); this.stats.dirtyBy.fields += this.residency.pages.size; }
        if (!changed.length) return structural;
        const reach = changed.map(slot => {
            const m = LANDSCAPE_SURFACE_CACHE_INPUTS.warpMarginMeters + LANDSCAPE_SURFACE_CACHE_INPUTS.kernelMarginSpacings * inputs.levelSpacings[slot.level], s = slot.bounds;
            return { level: slot.level, minX: s.minX - m, maxX: s.maxX + m, minZ: s.minZ - m, maxZ: s.maxZ + m };
        });
        const finestByMip = Array.from({ length: this.geometry.mips }, (_, mip) => landscapeSurfaceCacheMaskLevel(this.geometry, mip, inputs.levelSpacings));
        for (const record of this.residency.pages.values()) {
            const finest = finestByMip[record.mip], b = record.bounds;
            for (const r of reach) {
                if (r.level > finest || r.maxX < b.minX || r.minX > b.maxX || r.maxZ < b.minZ || r.minZ > b.maxZ) continue;
                this.dirty.add(record.key);
                this.stats.dirtyBy.masks++;
                break;
            }
        }
        return structural;
    }

    // a soil whose bound material (or micro) tier became finer marks the resident pages that hold it at the mips where its tier key improved
    #diffSoils(soils) {
        const previous = this.soilTiers;
        this.soilTiers = new Map(soils.map(soil => [soil.index, { tileMeters: soil.tileMeters, resolution: soil.resolution, microTileMeters: soil.microTileMeters, microResolution: soil.microResolution }]));
        if (!previous) return;
        for (const soil of soils) {
            const old = previous.get(soil.index);
            if (!old || (old.tileMeters === soil.tileMeters && old.resolution === soil.resolution && old.microTileMeters === soil.microTileMeters && old.microResolution === soil.microResolution)) continue;
            const improved = new Set();
            for (let mip = 0; mip <= this.geometry.rootMip; mip++) {
                const texel = landscapeSurfaceCacheTexelMeters(this.geometry, mip), [a, b] = landscapeSurfaceCacheSoilTiers(old, texel), [c, d] = landscapeSurfaceCacheSoilTiers(soil, texel);
                if (landscapeSurfaceCacheTierRank(c) > landscapeSurfaceCacheTierRank(a) || landscapeSurfaceCacheTierRank(d) > landscapeSurfaceCacheTierRank(b)) improved.add(mip);
            }
            if (!improved.size) continue;
            for (const record of this.residency.pages.values()) {
                if (!improved.has(record.mip) || !record.inputs?.soils.some(entry => entry[0] === soil.index)) continue;
                this.dirty.add(record.key);
                this.stats.dirtyBy.soils++;
            }
        }
    }

    // the camera's change since the last plan: a projection type change always replans, a pixel footprint scale change (field of view, zoom,
    // orthographic height, viewport) beyond replanScaleRatio, movement beyond a mip-0 page (or a quarter of the finest desired page) and turning
    // beyond replanTurnRadians replan at once, smaller changes every few frames, and an unchanged camera every demand refresh period (inputs and
    // capacity may have changed)
    #replanNeeded(snapshot, nearStart) {
        const previous = this.lastCamera;
        if (!previous || this.feedback.length || nearStart !== this.lastNearStart || snapshot.projection !== previous.projection) return true;
        const scale = camera => (camera.projection === 'orthographic' ? camera.orthoHeight : 2 * Math.tan(camera.fovYRadians / 2)) / camera.zoom / camera.viewportHeight;
        const rescaled = Math.abs(Math.log(scale(snapshot) / scale(previous)));
        if (rescaled > RUNTIME.replanScaleRatio) return true;
        const p = snapshot.position, d = snapshot.direction, since = this.frame - this.lastDemandFrame;
        const moved = Math.hypot(p.x - previous.position.x, p.y - previous.position.y, p.z - previous.position.z);
        const turned = Math.acos(Math.min(1, Math.max(-1, d.x * previous.direction.x + d.y * previous.direction.y + d.z * previous.direction.z)));
        // the move threshold grows with the finest desired page (a quarter of it), so aerial flight replans as rarely as its coarse pages allow
        const finest = this.lastPlan?.byMip?.findIndex(count => count > 0) ?? 0;
        if (moved > Math.max(RUNTIME.replanMoveMeters, landscapeSurfaceCachePageMeters(this.geometry, Math.max(0, finest)) / 4) || turned > RUNTIME.replanTurnRadians) return true;
        if ((moved > 1e-3 || turned > 1e-5 || rescaled > 1e-6 || this.motionBias > 0) && since >= RUNTIME.replanFrames) return true;
        return since >= RUNTIME.demandRefreshFrames;
    }

    // a camera turned ahead by its turn since the last plan, extrapolated to the turn prefetch time (at most turnPrefetchMaxRadians)
    #turnAhead(camera, viewportHeight, previous, seconds) {
        const from = new THREE.Vector3(previous.direction.x, previous.direction.y, previous.direction.z), to = camera.getWorldDirection(new THREE.Vector3());
        const angle = from.angleTo(to);
        if (!(seconds > 0) || angle / seconds < RUNTIME.turnPrefetchMinimumSpeed) return null;
        const ahead = Math.min(RUNTIME.turnPrefetchMaxRadians, angle * RUNTIME.turnPrefetchSeconds / seconds);
        const turn = new THREE.Quaternion().setFromUnitVectors(from, to), axis = new THREE.Vector3(turn.x, turn.y, turn.z);
        if (axis.lengthSq() < 1e-12) return null;
        const extrapolated = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), ahead), probe = camera.clone();
        probe.quaternion.premultiply(extrapolated);
        probe.updateMatrixWorld(true);
        return landscapeCameraSnapshot(probe, viewportHeight);
    }

    // a perspective camera zooming in: the same camera with its pixel footprint extrapolated zoomPrefetchSeconds ahead (at most zoomPrefetchMaxRatio of
    // the current footprint), as a prefetch view
    #zoomAhead(camera, viewportHeight, previous, seconds) {
        if (!(seconds > 0) || !camera.isPerspectiveCamera || previous.projection !== 'perspective') return null;
        const footprint = (fovY, zoom) => Math.tan(fovY / 2) / zoom, rate = Math.log(footprint(camera.fov * Math.PI / 180, camera.zoom) / footprint(previous.fovYRadians, previous.zoom)) / seconds;
        if (!(rate < -RUNTIME.zoomPrefetchMinimumRate)) return null;
        const probe = camera.clone();
        probe.zoom = camera.zoom / Math.max(RUNTIME.zoomPrefetchMaxRatio, Math.exp(rate * RUNTIME.zoomPrefetchSeconds));
        probe.updateProjectionMatrix();
        probe.updateMatrixWorld(true);
        return landscapeCameraSnapshot(probe, viewportHeight);
    }

    #plan(snapshot, camera, viewportHeight, nearStart) {
        const started = performance.now(), previous = this.lastCamera, seconds = previous ? (started - this.lastPlanTime) / 1000 : 0;
        const velocity = previous && seconds > 0 ? { x: (snapshot.position.x - previous.position.x) / seconds, y: (snapshot.position.y - previous.position.y) / seconds,
            z: (snapshot.position.z - previous.position.z) / seconds } : null;
        const turned = previous && snapshot.projection === 'perspective' ? this.#turnAhead(camera, viewportHeight, previous, seconds) : null;
        const zoomed = previous ? this.#zoomAhead(camera, viewportHeight, previous, seconds) : null;
        const speed = velocity ? Math.hypot(velocity.x, velocity.y, velocity.z) : 0, d = snapshot.direction, p = previous?.direction;
        const turnSpeed = p && seconds > 0 ? Math.acos(Math.min(1, Math.max(-1, d.x * p.x + d.y * p.y + d.z * p.z))) / seconds : 0;
        const scale = this.biasScale ?? 1;
        const wanted = Math.min(RUNTIME.maxBias, Math.max(0, Math.log2(Math.max(speed, 1e-6) * scale / RUNTIME.biasSpeed), Math.log2(Math.max(turnSpeed, 1e-9) * scale / RUNTIME.biasTurnSpeed)));
        this.motionBias = Math.max(wanted, (this.motionBias ?? 0) - RUNTIME.biasRelaxPerSecond * seconds);
        const ground = this.envelope(snapshot.position.x, snapshot.position.z, snapshot.position.x, snapshot.position.z);
        this.center = chooseLandscapeSurfaceCacheCenter({ geometry: this.geometry, camera: snapshot, groundHeight: (ground.min + ground.max) / 2, previous: this.center });
        this.indirection.setCenter(this.center);
        const capacity = Math.max(1, this.layout.slots - LANDSCAPE_SURFACE_CACHE.reservedSlots);
        let plan = planLandscapeSurfaceCacheDemand({ geometry: this.geometry, camera: snapshot, center: this.center, heightRange: this.envelope, anisotropy: this.anisotropy, capacity, velocity,
            bounds: this.bounds, nearStart, views: [turned, zoomed].filter(Boolean), lodBias: this.motionBias });
        if (this.feedback.length) { plan = mergeLandscapeSurfaceCacheFeedback({ geometry: this.geometry, plan, feedback: this.feedback, capacity }); this.feedback = []; }
        this.demandSeq++;
        const keys = new Set();
        for (const page of plan.pages) { keys.add(page.key); this.residency.touch(page.key, this.demandSeq); }
        // requests of the previous plan that are still missing get one more plan period before they are canceled
        this.carried = (this.desired ?? []).filter(page => !keys.has(page.key) && !this.residency.get(page.key));
        this.desired = plan.pages;
        this.lastPlan = { desired: plan.desired, kept: plan.pages.length, visited: plan.visited, limited: plan.limited, byMip: plan.byMip, prefetch: plan.pages.filter(page => page.prefetch).length,
            feedback: plan.feedback ?? 0, pruned: plan.pruned ?? 0, turnPrefetch: !!turned, zoomPrefetch: !!zoomed, carried: this.carried.length, motionBias: this.motionBias,
            biasScale: this.biasScale ?? 1 };
        this.lastCamera = { position: { ...snapshot.position }, direction: { ...snapshot.direction }, fovYRadians: snapshot.fovYRadians, zoom: snapshot.zoom, viewportHeight: snapshot.viewportHeight,
            orthoHeight: snapshot.orthoHeight, projection: snapshot.projection };
        this.lastPlanTime = started;
        this.lastNearStart = nearStart;
        this.lastDemandFrame = this.frame;
        this.stats.demandUpdates++;
        this.stats.demandMs = performance.now() - started;
    }

    #pageInputs(inputs, mip, x, z) {
        return landscapeSurfaceCachePageInputs({ geometry: this.geometry, global: this.globalKey, byLevel: this.byLevel, levelSpacings: inputs.levelSpacings, soils: inputs.soils,
            alwaysSoils: inputs.rock >= 0 ? [inputs.rock] : [], unstableBoxes: this.tiles.transitions, tiles: mip >= LANDSCAPE_SURFACE_CACHE.overviewGeometryMip ? this.overviewSources : this.leafSources,
            mip, x, z });
    }

    // geometry sources of the page identities; leaves that entered or left the rendered set mark the resident pages drawn from them for a check
    #diffTiles() {
        const leaves = this.tiles.leaves.map(({ descriptor }) => ({ id: descriptor.id, bounds: descriptor.bounds })), next = new Set(leaves.map(leaf => leaf.id));
        this.overviewSources ??= [{ id: this.stream.manifest.overviewId, bounds: this.bounds }];
        const changed = [...leaves.filter(leaf => !this.leafIds?.has(leaf.id)), ...(this.leafSources ?? []).filter(leaf => !next.has(leaf.id))];
        this.leafSources = leaves;
        this.leafIds = next;
        if (!changed.length) return;
        for (const record of this.residency.pages.values()) {
            if (record.mip >= LANDSCAPE_SURFACE_CACHE.overviewGeometryMip) continue;
            const b = record.bounds;
            if (changed.some(({ bounds: t }) => !(t.maxX < b.minX || t.minX > b.maxX || t.maxZ < b.minZ || t.minZ > b.maxZ))) { this.dirty.add(record.key); this.stats.dirtyBy.tiles++; }
        }
    }

    // bounded identity checks of pages whose inputs changed; a change that can make the page stale (monotonic, landscapeSurfaceCacheInputChange) marks
    // it stale (it keeps rendering until regenerated), inputs that only coarsened keep it
    #refreshIdentities(inputs) {
        let checks = 0;
        const started = performance.now();
        for (const key of this.dirty) {
            if (checks >= RUNTIME.identityChecksPerFrame || performance.now() - started > RUNTIME.identityCheckMs) break;
            this.dirty.delete(key);
            const record = this.residency.get(key);
            if (!record || record.stale) continue;
            checks++;
            const next = this.#pageInputs(inputs, record.mip, record.x, record.z);
            if (next.identity === record.identity) continue;
            const change = landscapeSurfaceCacheInputChange(record.inputs, next.parts);
            if (change) { record.stale = true; this.stats.staleMarked++; this.stats.staleBy[change]++; } else this.stats.keptCoarser++;
        }
        this.stats.identityChecks += checks;
    }

    // missing pages first (coarse and near first: the demand's priority order), then stale and provisional ones. A missing page whose inputs are
    // still settling (mask fades, a material tier transition, a geometry morph under it) generates at once as a provisional version, regenerated
    // once they settled; a resident page waits for them (its version keeps rendering). The frame's candidates pack into blocks; packed pages take
    // slots in priority order until the atlas has none to give
    #generate(inputs, started) {
        const missing = [], stale = [];
        for (const page of this.desired) { const record = this.residency.get(page.key); if (!record) missing.push(page); else if (record.stale || record.provisional) stale.push(page); }
        for (const page of this.carried ?? []) if (!this.residency.get(page.key)) missing.push(page);
        this.pendingMissing = missing.length;
        this.pendingMissingInView = missing.reduce((count, page) => count + (page.prefetch ? 0 : 1), 0);
        this.pendingStale = stale.length;
        const quota = this.quota, limit = 2 * quota + 16;
        const candidates = [];
        this.capacityLimited = false;
        let unstable = 0, examined = 0;
        for (const list of [missing, stale]) for (const page of list) {
            if (candidates.length >= quota || examined >= limit || performance.now() - started > RUNTIME.cpuBudgetMs) break;
            if ((this.unstable.get(page.key) ?? -1) > this.frame) { unstable++; continue; }
            examined++;
            const pageInputs = this.#pageInputs(inputs, page.mip, page.x, page.z), record = this.residency.get(page.key);
            if (!pageInputs.stable && record) { unstable++; this.unstable.set(page.key, this.frame + RUNTIME.unstableRecheckFrames); continue; }
            this.unstable.delete(page.key);
            if (record && !record.provisional && (record.identity === pageInputs.identity || !landscapeSurfaceCacheInputChange(record.inputs, pageInputs.parts))) { record.stale = false; continue; }
            candidates.push({ ...page, identity: pageInputs.identity, parts: pageInputs.parts, provisional: !pageInputs.stable, regenerate: !!record });
        }
        this.pendingUnstable = unstable;
        this.stats.unstableSkips += unstable;
        if (!candidates.length) return;
        const packed = packLandscapeSurfaceCacheBlocks(candidates), blockOf = new Map();
        for (const block of packed.blocks) for (const page of block.pages) blockOf.set(page, block);
        const selected = [];
        for (const page of candidates) {
            const block = blockOf.get(page);
            if (!block) continue;
            const allocation = this.residency.allocate(this.demandSeq);
            if (allocation.slot < 0) { this.capacityLimited = true; this.stats.capacityStops++; break; }
            if (allocation.evicted) { this.indirection.markPage(allocation.evicted.mip, allocation.evicted.x, allocation.evicted.z); this.stats.evictions++; }
            selected.push({ ...page, slot: allocation.slot, block });
        }
        if (!selected.length) return;
        const blocks = packed.blocks.filter(block => selected.some(page => page.block === block));
        const renderStarted = performance.now();
        this.#render(blocks, selected, quota);
        for (const page of selected) {
            this.residency.publish({ key: page.key, slot: page.slot, identity: page.identity, frame: this.demandSeq, pinned: page.mip === this.geometry.rootMip });
            const record = this.residency.get(page.key);
            record.inputs = page.parts;
            record.provisional = page.provisional;
            record.bounds = landscapeSurfaceCachePageBounds(this.geometry, page.mip, page.x, page.z, { gutter: true });
            this.indirection.markPage(page.mip, page.x, page.z);
            if (page.regenerate) this.stats.regenerated++;
            if (page.provisional) this.stats.provisionalGenerated++;
            if (page.mip === this.geometry.rootMip && this.stats.rootGeneratedAtMs === null) this.stats.rootGeneratedAtMs = performance.now() - this.stats.createdAtMs;
        }
        this.stats.pagesGenerated += selected.length;
        this.stats.pagesLastFrame = selected.length;
        this.stats.framesWithGeneration++;
        this.stats.generationCpuMs = performance.now() - renderStarted;
        this.stats.peakGenerationCpuMs = Math.max(this.stats.peakGenerationCpuMs, this.stats.generationCpuMs);
    }

    #clearPool() {
        for (const mesh of this.drawPool) this.scene.remove(mesh);
        this.drawPool = [];
    }

    /**
     * Feedback interface (unused by the shipped runtime, which plans on the CPU): pages a frame found missing (for example a GPU readback of the pages
     * the cached frame wanted). They join the next demand plan after its own pages, with their ancestors, while capacity remains.
     * @param {ReadonlyArray<{mip:number,x:number,z:number}>} pages
     */
    requestFeedback(pages) {
        if (!this.available) return;
        for (const page of pages) landscapeSurfaceCachePageBounds(this.geometry, page.mip, page.x, page.z);
        this.feedback.push(...pages.map(({ mip, x, z }) => ({ mip, x, z })));
    }

    /**
     * Near pass mode and hand-over band in mip-0 texels (evidence switch; the contract defaults are the shipped band). @param {'on'|'off'} mode
     * @param {{startTexels?:number,endTexels?:number}} [band]
     */
    setNear(mode, band = {}) {
        this.nearOptions = { mode, band: landscapeSurfaceCacheNearBand(band), texels: band };
        this.near?.configure(mode, band);
        return this.near?.snapshot() ?? null;
    }

    /** Pages generated in the next frame: the timer-driven quota. */
    get quota() { return Math.max(1, Math.min(RUNTIME.maximumPagesPerFrame, Math.round(this.gpu.quota))); }

    /**
     * GPU milliseconds a generation batch targets: the budget, or the headroom the view's recent frames leave below the frame period, whichever is less,
     * never below the floor (fallbackFloorMs while pages the current view samples are missing).
     */
    get generationTargetMs() {
        return landscapeSurfaceCacheGenerationTarget({ frameGpuMs: this.frameGpuMs ?? null, budgetMs: RUNTIME.generationBudgetMs, periodMs: RUNTIME.framePeriodMs,
            marginMs: RUNTIME.frameMarginMs, floorMs: this.pendingMissingInView > 0 ? RUNTIME.fallbackFloorMs : RUNTIME.generationFloorMs });
    }

    // world rectangle of a block's pages plus one gutter around them
    #blockBounds(block) {
        const size = landscapeSurfaceCachePageMeters(this.geometry, block.mip), gutter = size * LANDSCAPE_SURFACE_CACHE.gutterTexels / LANDSCAPE_SURFACE_CACHE.pageTexels;
        return { minX: this.geometry.originX + block.x0 * size - gutter, maxX: this.geometry.originX + (block.x1 + 1) * size + gutter,
            minZ: this.geometry.originZ + block.z0 * size - gutter, maxZ: this.geometry.originZ + (block.z1 + 1) * size + gutter };
    }

    // a block's world-to-clip mapping: a top-down orthographic projection of the block's pages and gutter onto its scratch rectangle (world x along the
    // rectangle's columns, world z along its rows, the height range into depth), applied by the generation vertex program as its model matrix
    #blockMatrix(block, matrix) {
        const b = this.#blockBounds(block), w = b.maxX - b.minX, h = b.maxZ - b.minZ, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        const [low, high] = RUNTIME.heightRangeMeters, depth = high - low;
        return matrix.set(2 / w, 0, 0, -2 * cx / w, 0, 0, 2 / h, -2 * cz / h, 0, -2 / depth, 0, 1 + 2 * low / depth, 0, 0, 0, 1);
    }

    // a pooled generation draw: the tile geometry, its row range under the block, the block's scratch rectangle as the viewport and its mapping as the
    // model matrix, all set around the draw itself; the material and the camera stay the same for every draw of the frame, so three.js uploads only
    // the per-object matrices between them (a camera per block re-uploaded every program uniform, the dominant generation cost)
    #poolMesh(index) {
        let mesh = this.drawPool[index];
        if (!mesh) {
            mesh = new THREE.Mesh(this.poolGeometry, this.program.material);
            mesh.frustumCulled = false;
            mesh.matrixAutoUpdate = false;
            mesh.userData.viewport = new THREE.Vector4();
            let saved = null;
            mesh.onBeforeRender = (renderer, scene, camera, geometry) => {
                saved = { start: geometry.drawRange.start, count: geometry.drawRange.count };
                geometry.setDrawRange(mesh.userData.range[0], mesh.userData.range[1]);
                renderer.state.viewport(mesh.userData.viewport);
            };
            mesh.onAfterRender = (renderer, scene, camera, geometry) => { if (saved) geometry.setDrawRange(saved.start, saved.count); saved = null; };
            this.drawPool[index] = mesh;
            this.scene.add(mesh);
        }
        mesh.material = this.program.material;
        return mesh;
    }

    // the frame's generation draws: for every block the tiles under it (the overview tile for coarse pages, otherwise the rendered leaves) with only
    // their triangle rows under the block and its gutter
    #batchDraws(blocks) {
        const tiles = this.tiles, root = [{ model: tiles.root, descriptor: this.stream.descriptors.get(this.stream.manifest.overviewId) }];
        let used = 0;
        for (const block of blocks) {
            const bounds = this.#blockBounds(block), models = block.mip >= LANDSCAPE_SURFACE_CACHE.overviewGeometryMip ? root : tiles.leaves;
            for (const { model, descriptor } of models) {
                const b = descriptor.bounds;
                if (bounds.maxX < b.minX || bounds.minX > b.maxX || bounds.maxZ < b.minZ || bounds.minZ > b.maxZ) continue;
                const dz = (b.maxZ - b.minZ) / (descriptor.rows - 1), rowIndices = 6 * (descriptor.columns - 1);
                const first = Math.max(0, Math.floor((b.maxZ - bounds.maxZ) / dz) - 1), last = Math.min(descriptor.rows - 2, Math.ceil((b.maxZ - bounds.minZ) / dz));
                const mesh = this.#poolMesh(used++);
                mesh.geometry = model.mesh.geometry;
                mesh.userData.range = [first * rowIndices, (last - first + 1) * rowIndices];
                mesh.userData.viewport.set(block.origin.x, block.origin.y, block.width, block.height);
                this.#blockMatrix(block, mesh.matrixWorld);
                mesh.visible = true;
            }
        }
        for (let index = used; index < this.drawPool.length; index++) this.drawPool[index].visible = false;
        return used;
    }

    // the unpack quads of one atlas layer at one slot level: each page's slot in clip space of the level's target, with its scratch and slot origins
    #fillUnpack(group, level) {
        const size = LANDSCAPE_SURFACE_CACHE.slotTexels / 2 ** level, texels = level ? this.layout.levelOneTexels : this.layout.layerTexels;
        const data = this.unpackData, clip = value => value / texels * 2 - 1;
        group.forEach((page, index) => {
            const x = level ? page.position.x1 : page.position.x0, y = level ? page.position.y1 : page.position.y0, x0 = clip(x), x1 = clip(x + size), y0 = clip(y), y1 = clip(y + size);
            const corners = [x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1];
            for (let k = 0; k < 6; k++) {
                const o = (index * 6 + k) * 6;
                data[o] = corners[2 * k]; data[o + 1] = corners[2 * k + 1]; data[o + 2] = page.source.x; data[o + 3] = page.source.y; data[o + 4] = x; data[o + 5] = y;
            }
        });
        return group.length * 6;
    }

    // generation of the frame's blocks into the packed scratch (by geometry class), then unpacking each page from its block into its atlas slots:
    // level 0 copied, level 1 and the response atlas box-filtered (by atlas layer). Only blocks reaching beyond the landscape are cleared to the
    // neutral texel first; elsewhere the tiles cover every texel of a block
    #render(blocks, selected, quota) {
        const renderer = this.renderer, gl = renderer.getContext(), state = renderer.state, autoClear = renderer.autoClear, renderStarted = performance.now();
        // two sequential timer queries: the generation draws and the unpack (their sum drives the batch size)
        const query = this.timer && !this.gpu.pending.length ? gl.createQuery() : null, unpackQuery = query ? gl.createQuery() : null;
        renderer.autoClear = false;
        const pages = selected.map(page => ({ ...page, position: landscapeSurfaceCacheSlotPosition(this.layout, page.slot), source: landscapeSurfaceCacheBlockPageOrigin(page.block, page) }));
        try {
            renderer.setRenderTarget(this.scratch.target);
            if (query) gl.beginQuery(this.timer.TIME_ELAPSED_EXT, query);
            const outside = blocks.filter(block => { const b = this.#blockBounds(block); return b.minX < this.bounds.minX || b.minZ < this.bounds.minZ || b.maxX > this.bounds.maxX || b.maxZ > this.bounds.maxZ; });
            if (outside.length) {
                state.setScissorTest(true);
                for (const block of outside) {
                    state.scissor(this.clearRect.set(block.origin.x, block.origin.y, block.width, block.height));
                    gl.clearBufferfv(gl.COLOR, 0, RUNTIME.neutral);
                }
                state.setScissorTest(false);
                this.stats.clearedBlocks += outside.length;
            }
            // every (block, tile) draw of the frame in one pass through the identity camera
            try {
                if (this.#batchDraws(blocks)) renderer.render(this.scene, this.generationCamera);
            } finally {
                for (const mesh of this.drawPool) { mesh.geometry = this.poolGeometry; mesh.visible = false; }
            }
            renderer.setRenderTarget(null);
            if (query) { gl.endQuery(this.timer.TIME_ELAPSED_EXT); gl.beginQuery(this.timer.TIME_ELAPSED_EXT, unpackQuery); }
            const unpackStarted = performance.now();
            this.stats.renderCpu = { generationMs: unpackStarted - renderStarted, draws: renderer.info.render.calls };
            this.#unpack(gl, pages);
            this.stats.renderCpu.unpackMs = performance.now() - unpackStarted;
        } finally {
            renderer.setRenderTarget(null);
            renderer.autoClear = autoClear;
            if (query) {
                gl.endQuery(this.timer.TIME_ELAPSED_EXT);
                this.gpu.pending.push({ query, unpackQuery, pages: selected.length, blocks: blocks.length, quota, frame: this.frame, submitMs: performance.now() - renderStarted,
                    draws: this.stats.renderCpu?.draws ?? 0 });
            }
            // submit the batch at once: the GPU starts it before the frame is drawn, and its timer queries do not span a later submission
            gl.flush();
        }
        this.stats.blocksLastFrame = blocks.length;
    }

    // raw WebGL unpack of the frame's pages: per atlas layer and slot level one vertex upload and one draw per target format; three.js's state cache is
    // reset afterwards, so its next draw rebinds what it needs
    #unpack(gl, pages) {
        const handles = this.#unpackProgram(gl);
        gl.useProgram(handles.program);
        gl.bindVertexArray(this.unpackVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.scratchTexture);
        gl.uniform1i(handles.scratch, 0);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.STENCIL_TEST); gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        gl.colorMask(true, true, true, true); gl.depthMask(false);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.unpackBuffer);
        try {
            for (const level of [0, 1]) {
                gl.uniform1i(handles.level, level);
                for (let layer = 0; layer < this.layout.layers; layer++) {
                    const group = pages.filter(page => page.position.layer === layer);
                    if (!group.length) continue;
                    const vertices = this.#fillUnpack(group, level);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.unpackData, 0, vertices * 6);
                    this.framebuffers[layer][level].forEach((target, format) => {
                        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
                        gl.viewport(0, 0, target.size, target.size);
                        gl.uniform1i(handles.target, format);
                        gl.drawArrays(gl.TRIANGLES, 0, vertices);
                    });
                }
            }
        } finally {
            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            this.renderer.resetState();
        }
    }

    #pollTimer() {
        if (!this.timer) return;
        const gl = this.renderer.getContext();
        while (this.gpu.pending.length) {
            const entry = this.gpu.pending[0];
            if (!gl.getQueryParameter(entry.unpackQuery, gl.QUERY_RESULT_AVAILABLE) || !gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) break;
            this.gpu.pending.shift();
            const disjoint = gl.getParameter(this.timer.GPU_DISJOINT_EXT), generationMs = gl.getQueryParameter(entry.query, gl.QUERY_RESULT) / 1e6;
            const unpackMs = gl.getQueryParameter(entry.unpackQuery, gl.QUERY_RESULT) / 1e6, ms = generationMs + unpackMs;
            gl.deleteQuery(entry.query);
            gl.deleteQuery(entry.unpackQuery);
            if (disjoint) { this.gpu.disjoint++; continue; }
            // the batch's own cost: the unpack beyond a few times its recent median is another process's work inside its timer window
            const own = landscapeSurfaceCacheBatchCost({ generationMs, unpackMs, unpackMedianMs: this.gpu.unpacks.length ? median(this.gpu.unpacks) : null });
            this.gpu.unpacks.push(unpackMs);
            if (this.gpu.unpacks.length > RUNTIME.quotaWindow) this.gpu.unpacks.shift();
            if (own.externalMs > 0) { this.gpu.external++; this.gpu.externalMs += own.externalMs; }
            this.gpu.lastMs = own.ms;
            this.gpu.maxMs = Math.max(this.gpu.maxMs, own.ms);
            this.gpu.samples.push({ ms: own.ms, timerMs: ms, pages: entry.pages, blocks: entry.blocks, generationMs, unpackMs, submitMs: entry.submitMs, draws: entry.draws });
            this.gpu.total = (this.gpu.total ?? 0) + 1;
            if (this.gpu.samples.length > 240) this.gpu.samples.shift();
            this.gpu.perPageMs = this.gpu.perPageMs === null ? own.ms / entry.pages : .7 * this.gpu.perPageMs + .3 * own.ms / entry.pages;
            // the quota from the fitted cost line of the recent batches (LandscapeSurfaceCacheController.js)
            this.gpu.window.push([entry.pages, own.ms]);
            if (this.gpu.window.length > RUNTIME.quotaWindow) this.gpu.window.shift();
            this.gpu.model = fitLandscapeSurfaceCacheCost(this.gpu.window);
            if (own.ms - this.gpu.model.fixedMs - this.gpu.model.perPageMs * entry.pages > this.gpu.model.outlierMs) this.gpu.spikes++;
            this.gpu.quota = nextLandscapeSurfaceCacheQuota({ quota: this.gpu.quota, model: this.gpu.model, targetMs: this.generationTargetMs, limitMs: RUNTIME.generationLimitMs,
                lastMs: own.ms, lastPages: entry.pages, maximum: RUNTIME.maximumPagesPerFrame, growth: RUNTIME.quotaGrowth, cut: RUNTIME.quotaCut });
        }
    }

    // the indirection uploads in the frame its pages publish (a reused slot must never be read through a stale entry); at most one layer per mip
    // (16 KiB with 64-page windows, 64 KiB with 128), so it is always admitted and only counted against the frame's upload allowance
    #upload(rebuilt) {
        if (!rebuilt.length && this.indirectionUploaded) return 0;
        const bytes = this.indirectionUploaded ? rebuilt.length * this.indirection.layerBytes : this.indirection.data.byteLength;
        if (this.indirectionUploaded) for (const layer of rebuilt) this.indirectionTexture.addLayerUpdate(layer);
        this.indirectionTexture.needsUpdate = true;
        this.renderer.initTexture(this.indirectionTexture);
        this.indirectionTexture.clearLayerUpdates();
        this.indirectionUploaded = true;
        this.stats.uploadBytes = bytes;
        return bytes;
    }

    #syncUniforms() {
        const u = this.appearance?.uniforms;
        if (!u || !this.available) return;
        this.placeholder ??= u.uSurfaceCacheIndirection.value === this.indirectionTexture ? null : u.uSurfaceCacheIndirection.value;
        const ready = this.ready && this.indirectionUploaded;
        u.uSurfaceCacheIndirection.value = ready ? this.indirectionTexture : this.placeholder;
        u.uSurfaceCacheAlbedo.value = ready ? this.textures.albedo : null;
        u.uSurfaceCacheMaterial.value = ready ? this.textures.material : null;
        u.uSurfaceCacheResponse.value = ready ? this.textures.response : null;
        u.uSurfaceCacheFrame.value.set(this.geometry.originX, this.geometry.originZ, this.center?.x ?? 0, this.center?.z ?? 0);
        u.uSurfaceCacheState.value.set(ready ? 1 : 0, this.anisotropy, this.geometry.rootMip, this.#microSoil());
    }

    // the micro-paired soil whose lattice the cached frame applies to all micro-paired coverage: the largest micro luminance scale (sand on the coast)
    #microSoil() {
        let best = -1, scale = 0;
        for (const soil of this.inputs?.soils ?? []) if (soil.microTileMeters > 0 && soil.microLuminance > scale) { best = soil.index; scale = soil.microLuminance; }
        return best;
    }

    /** Resident pages per mip, the CPU mirror of the frame's indirection lookup and the generation statistics. */
    snapshot() {
        if (!this.available) return { recipe: LANDSCAPE_SURFACE_CACHE.id, status: this.disposed ? 'disposed' : 'unavailable', reason: this.reason, ready: false, settled: true,
            atlas: this.fit ? { slots: this.fit.slots, targetSlots: this.fit.targetSlots, bytes: this.fit.atlasBytes, ceilingBytes: this.fit.ceilingBytes } : null };
        const residentByMip = Array.from({ length: this.geometry.mips }, () => 0), desiredByMip = Array.from({ length: this.geometry.mips }, () => 0);
        let stale = 0, resident = 0, provisional = 0;
        for (const record of this.residency.pages.values()) { residentByMip[record.mip]++; resident++; if (record.stale) stale++; if (record.provisional) provisional++; }
        let missing = 0, missingInView = 0, staleDesired = 0, provisionalDesired = 0;
        const missingByMip = Array.from({ length: this.geometry.mips }, () => 0);
        for (const page of this.desired) {
            desiredByMip[page.mip]++;
            const record = this.residency.get(page.key);
            if (!record) { missing++; missingByMip[page.mip]++; if (!page.prefetch) missingInView++; } else if (record.stale) staleDesired++; else if (record.provisional) provisionalDesired++;
        }
        const samples = this.gpu.samples.map(sample => sample.ms), entries = this.budget.snapshot().entries;
        // settled also waits for the near program while the near pass is on (its program links in parallel after the cache is ready)
        const nearPending = !!this.near && this.near.mode === 'on' && !this.near.program.ready;
        const settled = this.status === 'active' && this.program.ready && !nearPending && missing === 0 && staleDesired === 0 && provisionalDesired === 0 && !this.dirty.size;
        return {
            recipe: LANDSCAPE_SURFACE_CACHE.id, runtime: RUNTIME.id, demandRecipe: LANDSCAPE_SURFACE_CACHE_DEMAND.id, status: this.status, reason: this.reason, ready: this.ready, settled,
            // the cached frame program draws the cache (instead of the vertex-color bootstrap) only while this is set: the root page is resident and uploaded
            frameReady: this.appearance?.uniforms.uSurfaceCacheState.value.x === 1,
            geometry: { ...this.geometry, pageTexels: LANDSCAPE_SURFACE_CACHE.pageTexels, gutterTexels: LANDSCAPE_SURFACE_CACHE.gutterTexels },
            atlas: { slots: this.layout.slots, targetSlots: this.fit.targetSlots, layers: this.layout.layers, layerTexels: this.layout.layerTexels, slotTexels: LANDSCAPE_SURFACE_CACHE.slotTexels,
                slotBytes: this.layout.slotBytes, bytes: this.fit.atlasBytes, scratchBytes: this.fit.scratchBytes, gpuBytes: this.fit.gpuBytes, ceilingBytes: this.fit.ceilingBytes,
                fitReason: this.fit.reason, formats: LANDSCAPE_SURFACE_CACHE.formats,
                anisotropy: this.anisotropy, anisotropySupported: this.anisotropySupported },
            indirection: { bytes: this.fit.indirectionBytes, center: this.center ? { ...this.center } : null, rebuilds: this.indirection.rebuilds, uploaded: this.indirectionUploaded },
            ledger: { atlas: entries.find(entry => entry.key === this.atlasKey) ?? null, indirection: entries.find(entry => entry.key === this.indirectionKey) ?? null },
            pages: { resident, stale, provisional, desired: this.desired.length, missing, missingInView, staleDesired, provisionalDesired, unstable: this.pendingUnstable ?? 0, residentByMip, desiredByMip,
                missingByMip,
                freeSlots: this.residency.freeSlots,
                evictions: this.residency.evictions, capacityLimited: !!this.capacityLimited },
            misses: missing,
            generation: { program: { ready: this.program.ready, milliseconds: this.program.milliseconds, timedOut: this.program.timedOut, compiles: this.programCompiles ?? 0, cached: this.programs.size },
                pagesTotal: this.stats.pagesGenerated, pagesLastFrame: this.stats.pagesLastFrame, regenerated: this.stats.regenerated, framesWithGeneration: this.stats.framesWithGeneration,
                cpuMsLastFrame: this.stats.generationCpuMs, peakCpuMs: this.stats.peakGenerationCpuMs, gpuSupported: this.gpu.supported, gpuMsLast: this.gpu.lastMs, gpuMsMax: this.gpu.maxMs,
                gpuMsMedian: median(samples), gpuMsPerPage: this.gpu.perPageMs, gpuSamples: this.gpu.total ?? samples.length,
                recent: this.gpu.samples.slice(-32).map(sample => [sample.ms, sample.pages, sample.blocks, sample.generationMs, sample.unpackMs, sample.submitMs, sample.draws, sample.timerMs]),
                disjoint: this.gpu.disjoint, external: this.gpu.external, externalMs: this.gpu.externalMs,
                budgetMs: RUNTIME.generationBudgetMs,
                limitMs: RUNTIME.generationLimitMs, targetMs: this.generationTargetMs, frameGpuMs: this.frameGpuMs ?? null, lastFrameGpuMs: this.lastFrameGpuMs ?? null, quota: this.quota,
                spikes: this.gpu.spikes, controller: LANDSCAPE_SURFACE_CACHE_CONTROLLER.id,
                blocksLastFrame: this.stats.blocksLastFrame, renderCpu: this.stats.renderCpu ?? null,
                rootGeneratedAtMs: this.stats.rootGeneratedAtMs, unstableSkips: this.stats.unstableSkips, capacityStops: this.stats.capacityStops, provisional: this.stats.provisionalGenerated,
                model: this.gpu.model ? { ...this.gpu.model } : null },
            demand: { ...(this.lastPlan ?? {}), updates: this.stats.demandUpdates, ms: this.stats.demandMs, anisotropy: this.anisotropy },
            context: { losses: this.stats.contextLosses ?? 0, restores: this.stats.contextRestores ?? 0, lost: this.lost,
                rootAfterRestoreMs: this.stats.restoredAtMs !== undefined && this.stats.rootGeneratedAtMs !== null ? this.stats.rootGeneratedAtMs - (this.stats.restoredAtMs - this.stats.createdAtMs) : null },
            identity: { global: this.globalKey, flushes: this.stats.flushes, checks: this.stats.identityChecks, dirty: this.dirty.size, dirtyBy: { ...this.stats.dirtyBy }, staleMarked: this.stats.staleMarked,
                staleBy: { ...this.stats.staleBy }, keptCoarser: this.stats.keptCoarser },
            cpuMs: this.stats.cpuMs, cpu: { lastMs: this.stats.cpuMs, ...cpuWindow(this.cpuSamples), steps: { ...(this.stats.steps ?? {}) } }, uploadBytes: this.stats.uploadBytes, microSoil: this.#microSoil(),
            near: this.near?.snapshot() ?? null
        };
    }

    /** CPU mirror of the frame's lookup at a world position for a footprint (inspection). @param {number} x @param {number} z @param {number} footprint */
    lookup(x, z, footprint) {
        if (!this.available || !this.center) return null;
        const vx = x - this.geometry.originX, vz = z - this.geometry.originZ;
        let mip = Math.min(this.geometry.rootMip, Math.max(0, Math.floor(Math.log2(Math.max(footprint, 1e-9) / this.geometry.texel0Meters))));
        while (mip < this.geometry.rootMip) {
            const size = landscapeSurfaceCachePageMeters(this.geometry, mip), origin = this.indirection.origins[mip], px = Math.floor(vx / size), pz = Math.floor(vz / size);
            if (origin && px >= origin.x && pz >= origin.z && px < origin.x + this.geometry.windowPages && pz < origin.z + this.geometry.windowPages) break;
            mip++;
        }
        const size = landscapeSurfaceCachePageMeters(this.geometry, mip), px = Math.floor(vx / size), pz = Math.floor(vz / size), entry = this.indirection.entry(mip, px, pz);
        const record = entry.valid ? this.residency.pages.get(this.residency.slotKeys[entry.slot]) : null;
        return { requested: { mip, x: px, z: pz }, resident: entry.valid ? { slot: entry.slot, mip: entry.mip, page: record ? parseLandscapeSurfaceCachePageKey(record.key) : null, identity: record?.identity ?? null, stale: !!record?.stale } : null };
    }

    dispose() {
        if (this.disposed) return;
        this.unbind();
        this.disposed = true;
        this.renderer.domElement?.removeEventListener?.('webglcontextlost', this.onContextLost);
        this.renderer.domElement?.removeEventListener?.('webglcontextrestored', this.onContextRestored);
        if (!this.layout) return;
        const gl = this.renderer.getContext();
        for (const entry of this.gpu.pending) { gl.deleteQuery(entry.query); gl.deleteQuery(entry.unpackQuery); }
        this.gpu.pending = [];
        for (const pass of [...this.framebuffers.flat(2), this.scratch]) { gl.deleteFramebuffer(pass.framebuffer); this.renderer.properties.remove(pass.target); }
        for (const texture of [...Object.values(this.glTextures), this.scratchTexture]) gl.deleteTexture(texture);
        for (const texture of [...Object.values(this.textures), this.scratchExternal]) texture.dispose();
        this.#clearPool();
        this.poolGeometry.dispose();
        this.unpackMaterial.dispose();
        this.unpackMesh.geometry.dispose();
        gl.deleteBuffer(this.unpackBuffer);
        if (this.unpackVao) gl.deleteVertexArray(this.unpackVao);
        this.indirectionTexture.dispose();
        this.indirectionTexture.image.data = null;
        this.budget.release(this.atlasKey);
        this.budget.release(this.indirectionKey);
        this.residency.clear();
        this.layout = null;
        this.status = 'disposed';
        this.reason = 'surface-cache-disposed';
    }
}
