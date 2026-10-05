// Generates, stores and resolves the runtime surface cache: GPU atlases, page generation, residency, demand and the cached frame's uniforms.
// @ts-check
// AI577 D6 core (landscape-surface-cache-v1, contract in LandscapeSurfaceCacheLayout.js). Pages are generated on the GPU by the unlit generation
// variant of the terrain program, which draws each rendered tile's own surface through a top-down orthographic camera, so every footprint-driven
// fade and filter evaluates for the page texel. The generation program has one output: it packs three bytes per float into an RGBA32F scratch
// of up to 64 pages, and a tiny unpack program copies each page into its level-0 atlas slots and box-filters it into its level-1 slots and the
// half-resolution response atlas, one target per draw (ANGLE's D3D11 backend compiles another pixel shader executable at the first draw of a
// multiple-output program: 5.2 s of GPU-process stall for the generation program, 0.5 s for a multiple-target unpack). Pages generate in blocks
// of up to 4x4 neighbours of one mip, one camera per block, and all blocks of a frame render in one call through an array camera whose viewports
// are their packed scratch rectangles; tiles draw only the rows of triangles each block covers. Generation costs a fixed latency per frame plus
// shading per page (measured about 0.25 ms + 0.1 ms per page at 1920x1080 load; a second generation pass for level 1 cost a third more), so a
// feedback controller on GPU timer queries sizes each frame's batch to the 1 ms budget, within a bounded CPU time, coarse and near pages first.
// A page publishes atomically: it renders and unpacks in one frame before the indirection points at the new slot, and a stale version keeps
// rendering until then. The deterministic CPU demand of LandscapeSurfaceCacheDemand plans the pages per camera. Atlases, scratch and their
// framebuffers are raw WebGL2 objects (targets across texture levels and layers are not expressible with three.js render targets); three.js binds
// them through its state cache, renders into them through external framebuffer targets and samples them through ExternalTexture wrappers. The
// atlases, scratch and indirection are charged to the shared ledger under their own ceiling (3/8 of the GPU limit).
import * as THREE from 'three';
import { createLandscapeShaderPayload, landscapeTerrainUniformVectors, landscapeTerrainVariantUniformVectors } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { LANDSCAPE_SURFACE_CACHE, fitLandscapeSurfaceCache, landscapeSurfaceCacheGeometry, landscapeSurfaceCachePageBounds, landscapeSurfaceCachePageKey, landscapeSurfaceCachePageMeters,
    landscapeSurfaceCacheSlotLayout, landscapeSurfaceCacheSlotPosition, parseLandscapeSurfaceCachePageKey, landscapeSurfaceCacheMaskLevel, landscapeSurfaceCacheHash,
    landscapeSurfaceCacheScratchLayout, packLandscapeSurfaceCacheBlocks, landscapeSurfaceCacheBlockPageOrigin } from './LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_SURFACE_CACHE_DEMAND, chooseLandscapeSurfaceCacheCenter, createLandscapeSurfaceCacheTerrainEnvelope, mergeLandscapeSurfaceCacheFeedback, planLandscapeSurfaceCacheDemand } from './LandscapeSurfaceCacheDemand.js';
import { LandscapeSurfaceCacheIndirection, LandscapeSurfaceCacheResidency } from './LandscapeSurfaceCacheResidency.js';
import { LANDSCAPE_SURFACE_CACHE_INPUTS, indexLandscapeSurfaceCacheInputs, landscapeSurfaceCacheGlobalKey, landscapeSurfaceCachePageInputs } from './LandscapeSurfaceCacheInputs.js';
import { landscapeCameraSnapshot } from './LandscapeStreamer.js';

export const LANDSCAPE_SURFACE_CACHE_RUNTIME = Object.freeze({
    id: 'landscape-surface-cache-runtime-v1',
    generationBudgetMs: 1,
    // pages of the first batches, before timer samples size them; a timed batch at least this full of its quota moves the quota towards
    // pages x budget / measured ms (the fixed point of a fixed-plus-per-page cost is the budget)
    initialQuota: 16,
    quotaGain: .3,
    quotaFullFraction: .8,
    maximumPagesPerFrame: LANDSCAPE_SURFACE_CACHE.generationBatch,
    cpuBudgetMs: 4,
    identityChecksPerFrame: 400,
    demandRefreshFrames: 30,
    compileWaitMs: 60000,
    heightRangeMeters: Object.freeze([-2000, 8000]),
    // packed neutral texel of scratch areas without terrain (beyond the landscape): sRGB gray albedo, AO 1, the geometric normal, roughness 0.9,
    // no micro coverage or reach, a grass-like response
    neutral: Object.freeze([124 + 124 * 256 + 124 * 65536, 255 + 128 * 256 + 128 * 65536, 230, 77 + 255 * 256 + 77 * 65536]),
    modes: Object.freeze(['off', 'on'])
});

/** Snapshot of a view without a surface cache. */
export const LANDSCAPE_SURFACE_CACHE_OFF = Object.freeze({ recipe: LANDSCAPE_SURFACE_CACHE.id, status: 'off', reason: 'surface-cache-off', ready: false, settled: true });

const RUNTIME = LANDSCAPE_SURFACE_CACHE_RUNTIME;
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
const cpuWindow = samples => {
    const values = [...samples].filter(Number.isFinite).sort((a, b) => a - b);
    return { frames: values.length, medianMs: values[Math.floor(values.length / 2)] ?? null, p95Ms: values[Math.floor(values.length * .95)] ?? null, maxMs: values.at(-1) ?? null };
};

export class LandscapeSurfaceCache {
    /**
     * @param {{renderer:any,budget:any,loaded:any,coverageSlots:number,targetSlots?:number,anisotropy?:number}} options budget is the shared residency ledger; loaded the
     *   landscape overview (bounds, root heights); coverageSlots the compiled coverage slot count of the view's terrain programs
     */
    constructor({ renderer, budget, loaded, coverageSlots, targetSlots = LANDSCAPE_SURFACE_CACHE.targetSlots, anisotropy = LANDSCAPE_SURFACE_CACHE.maxAnisotropy }) {
        if (![1, 2, 4, 8, 16].includes(anisotropy)) throw new Error(`[LandscapeSurfaceCache] anisotropy must be 1, 2, 4, 8 or 16; received ${anisotropy}`);
        Object.assign(this, { renderer, budget, loaded, anisotropy, coverageSlots });
        this.prefix = `surface-cache/${crypto.randomUUID()}`;
        this.geometry = landscapeSurfaceCacheGeometry(loaded.manifest.bounds);
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
        this.recent = new Map();
        this.dirty = new Set();
        this.slotState = new Map();
        this.tokens = new Map();
        this.proxies = new Map();
        this.feedback = [];
        // CPU time of the last 120 updates (demand, identities, generation submission, indirection upload)
        this.cpuSamples = new Float64Array(120).fill(NaN);
        this.stats = { pagesGenerated: 0, pagesLastFrame: 0, regenerated: 0, framesWithGeneration: 0, unstableSkips: 0, capacityStops: 0, flushes: 0, evictions: 0, cpuMs: 0, generationCpuMs: 0,
            demandMs: 0, demandUpdates: 0, identityChecks: 0, uploadBytes: 0, clearedBlocks: 0, peakGenerationCpuMs: 0, rootGeneratedAtMs: null, createdAtMs: performance.now() };
        this.gpu = { samples: [], perPageMs: null, quota: RUNTIME.initialQuota, pending: [], lastMs: null, maxMs: 0, disjoint: 0, supported: false };
        this.program = { key: null, material: null, ready: false, milliseconds: null, timedOut: false, started: 0, compiles: 0 };
        const gl = renderer.getContext();
        const shared = landscapeTerrainUniformVectors(), variant = landscapeTerrainVariantUniformVectors().variantVectors;
        if (!renderer.capabilities.isWebGL2) { this.reason = 'surface-cache-device-webgl2'; return; }
        if (shared.fixedVectors + variant + coverageSlots * shared.slotVectors > renderer.capabilities.maxFragmentUniforms) { this.reason = 'surface-cache-device-uniforms'; return; }
        if (!gl.getExtension('EXT_color_buffer_float')) { this.reason = 'surface-cache-device-float-target'; return; }
        const ledger = budget.snapshot();
        this.fit = fitLandscapeSurfaceCache({ limits: ledger.limits, available: { gpuBytes: ledger.limits.gpuBytes - ledger.gpuBytes }, geometry: this.geometry, targetSlots,
            maxTextureSize: renderer.capabilities.maxTextureSize, maxArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) });
        if (!this.fit.slots) { this.reason = this.fit.reason; return; }
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
        this.indirectionTexture = new THREE.DataArrayTexture(this.indirection.data, LANDSCAPE_SURFACE_CACHE.windowPages, LANDSCAPE_SURFACE_CACHE.windowPages, this.geometry.mips);
        Object.assign(this.indirectionTexture, { format: THREE.RGBAIntegerFormat, type: THREE.UnsignedByteType, internalFormat: 'RGBA8UI', magFilter: THREE.NearestFilter,
            minFilter: THREE.NearestFilter, generateMipmaps: false, flipY: false });
        this.indirectionTexture.needsUpdate = true;
        this.indirectionUploaded = false;
        this.scene = new THREE.Scene();
        this.scene.matrixWorldAutoUpdate = false;
        this.arrayCamera = new THREE.ArrayCamera([]);
        this.pageCameras = [];
        this.unpackCameras = [];
        this.#createUnpack();
        this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        this.gpu.supported = !!this.timer;
        this.status = 'waiting';
        this.reason = 'surface-cache-unbound';
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

    // the unpack program: one clip-space triangle per atlas slot viewport, reading its page from the scratch
    #createUnpack() {
        const payload = createLandscapeShaderPayload('surface-cache-unpack');
        this.unpackMaterial = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource,
            uniforms: { uSurfaceCacheScratch: { value: this.scratchExternal }, uSurfaceCacheTarget: { value: 0 }, uSurfaceCacheLevel: { value: 0 } }, depthTest: false, depthWrite: false });
        attachShaderMetadata(this.unpackMaterial, payload);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
        this.unpackMesh = new THREE.Mesh(geometry, this.unpackMaterial);
        this.unpackMesh.frustumCulled = false;
        this.unpackScene = new THREE.Scene();
        this.unpackScene.matrixWorldAutoUpdate = false;
        this.unpackScene.add(this.unpackMesh);
    }

    /**
     * Binds the cache to the streams of one load; a new binding flushes every page (their identities belong to the previous load).
     * @param {{stream:any,appearance:any}} binding
     */
    bind({ stream, appearance }) {
        if (!this.available) { appearance.surfaceCache = this; return; }
        this.unbind();
        this.stream = stream;
        this.appearance = appearance;
        appearance.surfaceCache = this;
        this.placeholder = null;
        this.residency.clear();
        this.recent.clear(); this.dirty.clear(); this.slotState.clear(); this.desired = []; this.feedback = [];
        this.leafIds = null; this.leafSources = null; this.overviewSources = null;
        this.globalKey = null;
        this.center = null;
        this.indirection.center = null;
        this.indirection.origins.fill(null);
        this.status = 'waiting';
        this.reason = 'surface-cache-appearance-pending';
        this.#syncUniforms();
    }

    unbind() {
        if (this.appearance) {
            const u = this.appearance.uniforms;
            u.uSurfaceCacheState.value.x = 0;
            u.uSurfaceCacheAlbedo.value = u.uSurfaceCacheMaterial.value = u.uSurfaceCacheResponse.value = null;
            if (u.uSurfaceCacheIndirection.value === this.indirectionTexture) u.uSurfaceCacheIndirection.value = this.placeholder ?? u.uSurfaceCacheIndirection.value;
            if (this.appearance.surfaceCache === this) this.appearance.surfaceCache = null;
        }
        for (const proxy of this.proxies.values()) this.scene.remove(proxy);
        this.proxies.clear();
        this.program.material?.dispose();
        this.program = { key: null, material: null, ready: false, milliseconds: null, timedOut: false, started: 0, compiles: this.program.compiles };
        this.stream = null;
        this.appearance = null;
    }

    get ready() { return !!this.residency?.get(landscapeSurfaceCachePageKey(this.geometry.rootMip, 0, 0)); }

    // the unlit generation variant of the view's terrain program, sharing the overview tile's uniform cells (every tile's appearance, lighting and
    // planning cells are the same objects); it compiles through KHR_parallel_shader_compile while the page keeps drawing
    #ensureProgram() {
        const stream = this.stream, root = stream.surfaceCacheTiles().root;
        if (!root) return false;
        const variant = stream.programVariant, key = `${stream.coverageSlots}|${stream.materialSampling}|${stream.lightingTier}|${variant.terrainAppearance}`;
        if (this.program.key !== key || this.program.uniforms !== root.mesh.material.uniforms) {
            this.program.material?.dispose();
            for (const proxy of this.proxies.values()) this.scene.remove(proxy);
            this.proxies.clear();
            const payload = createLandscapeShaderPayload('terrain', { coverageSlots: stream.coverageSlots, materialSampling: stream.materialSampling, lightingTier: stream.lightingTier,
                terrainAppearance: variant.terrainAppearance, surfaceCacheGeneration: true });
            const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true, uniforms: root.mesh.material.uniforms,
                side: THREE.DoubleSide, depthTest: false, depthWrite: false });
            attachShaderMetadata(material, payload);
            const probe = new THREE.Mesh(root.mesh.geometry, material);
            probe.frustumCulled = false;
            const scene = new THREE.Scene();
            scene.add(probe);
            this.renderer.setRenderTarget(this.scratch.target);
            this.renderer.compile(scene, this.#blockCamera(0, { mip: 0, x0: 0, x1: 0, z0: 0, z1: 0 }));
            this.renderer.setRenderTarget(this.framebuffers[0][0][0].target);
            this.renderer.compile(this.unpackScene, this.#unpackCamera(0, { x: 0, y: 0 }, { x: 0, y: 0 }, 1));
            this.renderer.setRenderTarget(null);
            scene.remove(probe);
            this.renderer.getContext().flush();
            this.program = { key, uniforms: root.mesh.material.uniforms, material, ready: false, milliseconds: null, timedOut: false, started: performance.now(), compiles: this.program.compiles + 1 };
            this.globalKey = null;
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

    /**
     * One frame: demand, identity refresh, generation within its GPU and CPU budgets, indirection upload and the frame uniforms. Called before the
     * view renders, after the geometry and appearance streams updated.
     * @param {{dt:number,camera:any,viewportHeight:number,uploadAllowance?:number}} frame
     * @returns {number} uploaded bytes
     */
    update({ dt, camera, viewportHeight, uploadAllowance = Infinity }) {
        const started = performance.now();
        this.frame++;
        this.stats.pagesLastFrame = 0;
        this.stats.blocksLastFrame = 0;
        this.stats.uploadBytes = 0;
        this.#pollTimer();
        if (!this.available || !this.stream || !this.appearance) return 0;
        const appearance = this.appearance;
        if (!appearance.initialized || appearance.uniforms.uAppearanceReady.value !== 1) { this.status = 'waiting'; this.reason = 'surface-cache-appearance-pending'; return 0; }
        if (!this.#ensureProgram()) return 0;
        this.tiles = this.stream.surfaceCacheTiles();
        this.#pruneProxies();
        this.#diffTiles();
        const inputs = appearance.surfaceCacheInputs();
        const container = this.program.uniforms;
        const global = landscapeSurfaceCacheGlobalKey({ ...inputs.global, program: this.program.key, sea: container.uLandscapeSun.value.w, rockGate: container.uLandscapeResponse.value.w });
        if (global !== this.globalKey) {
            if (this.globalKey !== null) this.stats.flushes++;
            for (const record of this.residency.pages.values()) record.stale = true;
            this.globalKey = global;
        }
        this.inputs = inputs;
        this.byLevel = indexLandscapeSurfaceCacheInputs({ slots: inputs.slots.map(slot => ({ ...slot, key: this.#token(slot.key) })), levelSpacings: inputs.levelSpacings });
        this.#diffInputs(inputs);
        const snapshot = landscapeCameraSnapshot(camera, viewportHeight);
        if (this.#cameraMoved(snapshot) || this.feedback.length || this.frame - (this.lastDemandFrame ?? -Infinity) >= RUNTIME.demandRefreshFrames) this.#plan(snapshot, dt);
        this.#refreshIdentities(inputs);
        this.#generate(inputs, started);
        const rebuilt = this.indirection.rebuild((mip, x, z) => this.residency.slotOf(mip, x, z));
        const uploaded = this.#upload(rebuilt);
        this.stats.uploadOverAllowance = uploaded > uploadAllowance;
        this.#syncUniforms();
        this.status = this.ready ? 'active' : 'bootstrap';
        this.reason = this.ready ? (this.capacityLimited ? 'surface-cache-capacity' : this.fit.reason) : 'surface-cache-root-pending';
        this.stats.cpuMs = performance.now() - started;
        this.cpuSamples[this.frame % this.cpuSamples.length] = this.stats.cpuMs;
        return uploaded;
    }

    #token(key) {
        let token = this.tokens.get(key);
        if (!token) { token = landscapeSurfaceCacheHash(key); this.tokens.set(key, token); }
        return token;
    }

    // mask pages that appeared, disappeared, changed identity or fade progress mark the resident pages they can reach (at the mips whose texel
    // still resolves their level) for an identity check
    #diffInputs(inputs) {
        const next = new Map(inputs.slots.map(slot => [slot.id, slot])), changed = [];
        for (const [id, slot] of next) {
            const previous = this.slotState.get(id);
            if (!previous || previous.key !== slot.key || previous.progress !== slot.progress) changed.push(slot);
        }
        for (const [id, slot] of this.slotState) if (!next.has(id)) changed.push(slot);
        this.slotState = next;
        const soilKey = inputs.soils.map(soil => `${soil.resolution}/${soil.microTileMeters}/${soil.transitionResolution}`).join('|');
        if (soilKey !== this.soilKey) { this.soilKey = soilKey; for (const key of this.residency.pages.keys()) this.dirty.add(key); }
        if (inputs.fieldsFading !== this.fieldsFading) { this.fieldsFading = inputs.fieldsFading; for (const key of this.residency.pages.keys()) this.dirty.add(key); }
        if (!changed.length) return;
        const margin = slot => LANDSCAPE_SURFACE_CACHE_INPUTS.warpMarginMeters + LANDSCAPE_SURFACE_CACHE_INPUTS.kernelMarginSpacings * inputs.levelSpacings[slot.level];
        for (const record of this.residency.pages.values()) {
            const finest = landscapeSurfaceCacheMaskLevel(this.geometry, record.mip, inputs.levelSpacings), b = landscapeSurfaceCachePageBounds(this.geometry, record.mip, record.x, record.z, { gutter: true });
            for (const slot of changed) {
                if (slot.level > finest) continue;
                const m = margin(slot), s = slot.bounds;
                if (s.maxX + m < b.minX || s.minX - m > b.maxX || s.maxZ + m < b.minZ || s.minZ - m > b.maxZ) continue;
                this.dirty.add(record.key);
                break;
            }
        }
    }

    #cameraMoved(snapshot) {
        const previous = this.lastCamera, p = snapshot.position, d = snapshot.direction;
        if (!previous) return true;
        return Math.hypot(p.x - previous.position.x, p.y - previous.position.y, p.z - previous.position.z) > .01 || Math.hypot(d.x - previous.direction.x, d.y - previous.direction.y, d.z - previous.direction.z) > 1e-4
            || snapshot.fovYRadians !== previous.fovYRadians || snapshot.zoom !== previous.zoom || snapshot.viewportHeight !== previous.viewportHeight || snapshot.orthoHeight !== previous.orthoHeight
            || snapshot.projection !== previous.projection;
    }

    #plan(snapshot, dt) {
        const started = performance.now(), previous = this.lastCamera;
        const velocity = previous && dt > 0 ? { x: (snapshot.position.x - previous.position.x) / dt, y: (snapshot.position.y - previous.position.y) / dt, z: (snapshot.position.z - previous.position.z) / dt } : null;
        const ground = this.envelope(snapshot.position.x, snapshot.position.z, snapshot.position.x, snapshot.position.z);
        this.center = chooseLandscapeSurfaceCacheCenter({ geometry: this.geometry, camera: snapshot, groundHeight: (ground.min + ground.max) / 2, previous: this.center });
        this.indirection.setCenter(this.center);
        const capacity = Math.max(1, this.layout.slots - LANDSCAPE_SURFACE_CACHE.reservedSlots);
        let plan = planLandscapeSurfaceCacheDemand({ geometry: this.geometry, camera: snapshot, center: this.center, heightRange: this.envelope, anisotropy: this.anisotropy, capacity, velocity, bounds: this.bounds });
        if (this.feedback.length) { plan = mergeLandscapeSurfaceCacheFeedback({ geometry: this.geometry, plan, feedback: this.feedback, capacity }); this.feedback = []; }
        this.demandSeq++;
        for (const page of plan.pages) { this.residency.touch(page.key, this.demandSeq); this.recent.set(page.key, { page, seq: this.demandSeq }); }
        // requests absent for two demand frames are canceled
        for (const [key, entry] of this.recent) if (entry.seq < this.demandSeq - 1) this.recent.delete(key);
        this.desired = plan.pages;
        this.lastPlan = { desired: plan.desired, kept: plan.pages.length, visited: plan.visited, limited: plan.limited, byMip: plan.byMip, prefetch: plan.pages.filter(page => page.prefetch).length,
            feedback: plan.feedback ?? 0 };
        this.lastCamera = { position: { ...snapshot.position }, direction: { ...snapshot.direction }, fovYRadians: snapshot.fovYRadians, zoom: snapshot.zoom, viewportHeight: snapshot.viewportHeight,
            orthoHeight: snapshot.orthoHeight, projection: snapshot.projection };
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
            const b = landscapeSurfaceCachePageBounds(this.geometry, record.mip, record.x, record.z, { gutter: true });
            if (changed.some(({ bounds: t }) => !(t.maxX < b.minX || t.minX > b.maxX || t.maxZ < b.minZ || t.minZ > b.maxZ))) this.dirty.add(record.key);
        }
    }

    // bounded identity checks of pages whose inputs changed; a mismatch marks them stale (they keep rendering until regenerated)
    #refreshIdentities(inputs) {
        let checks = 0;
        for (const key of this.dirty) {
            if (checks++ >= RUNTIME.identityChecksPerFrame) break;
            this.dirty.delete(key);
            const record = this.residency.get(key);
            if (!record || record.stale) continue;
            if (this.#pageInputs(inputs, record.mip, record.x, record.z).identity !== record.identity) record.stale = true;
        }
        this.stats.identityChecks += Math.min(checks, RUNTIME.identityChecksPerFrame);
    }

    // missing pages first (coarse and near first: the demand's priority order), then stale ones; unstable pages wait for their inputs to settle. The
    // frame's candidates pack into blocks; packed pages take slots in priority order until the atlas has none to give
    #generate(inputs, started) {
        const missing = [], stale = [];
        const consider = page => { const record = this.residency.get(page.key); if (!record) missing.push(page); else if (record.stale) stale.push(page); };
        for (const page of this.desired) consider(page);
        for (const entry of this.recent.values()) if (entry.seq === this.demandSeq - 1 && !this.residency.get(entry.page.key)) missing.push(entry.page);
        this.pendingMissing = missing.length;
        this.pendingStale = stale.length;
        const quota = this.quota;
        const candidates = [];
        this.capacityLimited = false;
        let unstable = 0;
        for (const page of [...missing, ...stale]) {
            if (candidates.length >= quota || performance.now() - started > RUNTIME.cpuBudgetMs) break;
            const pageInputs = this.#pageInputs(inputs, page.mip, page.x, page.z);
            if (!pageInputs.stable) { unstable++; continue; }
            const record = this.residency.get(page.key);
            if (record && record.identity === pageInputs.identity) { record.stale = false; continue; }
            candidates.push({ ...page, identity: pageInputs.identity, regenerate: !!record });
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
            this.indirection.markPage(page.mip, page.x, page.z);
            if (page.regenerate) this.stats.regenerated++;
            if (page.mip === this.geometry.rootMip && this.stats.rootGeneratedAtMs === null) this.stats.rootGeneratedAtMs = performance.now() - this.stats.createdAtMs;
        }
        this.stats.pagesGenerated += selected.length;
        this.stats.pagesLastFrame = selected.length;
        this.stats.framesWithGeneration++;
        this.stats.generationCpuMs = performance.now() - renderStarted;
        this.stats.peakGenerationCpuMs = Math.max(this.stats.peakGenerationCpuMs, this.stats.generationCpuMs);
    }

    // proxies of tiles that left the rendered set are dropped (they share the tile geometry, which the stream disposes)
    #pruneProxies() {
        const current = new Set([this.tiles.root, ...this.tiles.leaves.map(tile => tile.model)]);
        for (const [model, proxy] of this.proxies) if (!current.has(model)) { this.scene.remove(proxy); this.proxies.delete(model); }
    }

    /**
     * Feedback interface for D6b2: pages the frame found missing (for example a GPU readback of the pages the cached frame wanted). They join the next
     * demand plan after its own pages, with their ancestors, while capacity remains. @param {ReadonlyArray<{mip:number,x:number,z:number}>} pages
     */
    requestFeedback(pages) {
        if (!this.available) return;
        for (const page of pages) landscapeSurfaceCachePageBounds(this.geometry, page.mip, page.x, page.z);
        this.feedback.push(...pages.map(({ mip, x, z }) => ({ mip, x, z })));
    }

    /** Pages generated in the next frame: the timer-driven quota. */
    get quota() { return Math.max(1, Math.min(RUNTIME.maximumPagesPerFrame, Math.round(this.gpu.quota))); }

    // world rectangle of a block's pages plus one gutter around them
    #blockBounds(block) {
        const size = landscapeSurfaceCachePageMeters(this.geometry, block.mip), gutter = size * LANDSCAPE_SURFACE_CACHE.gutterTexels / LANDSCAPE_SURFACE_CACHE.pageTexels;
        return { minX: this.geometry.originX + block.x0 * size - gutter, maxX: this.geometry.originX + (block.x1 + 1) * size + gutter,
            minZ: this.geometry.originZ + block.z0 * size - gutter, maxZ: this.geometry.originZ + (block.z1 + 1) * size + gutter };
    }

    // a top-down orthographic camera over a block of pages and its gutter, rendering into the block's scratch rectangle (world x along the
    // rectangle's columns, world z along its rows); view space is centered on the block for precision
    #blockCamera(index, block) {
        let camera = this.pageCameras[index];
        if (!camera) {
            camera = new THREE.Camera();
            camera.matrixAutoUpdate = false;
            camera.matrixWorldAutoUpdate = false;
            camera.viewport = new THREE.Vector4();
            this.pageCameras[index] = camera;
        }
        const b = this.#blockBounds(block), cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, [low, high] = RUNTIME.heightRangeMeters, depth = high - low;
        camera.matrixWorld.makeTranslation(cx, 0, cz);
        camera.matrixWorldInverse.makeTranslation(-cx, 0, -cz);
        camera.projectionMatrix.set(2 / (b.maxX - b.minX), 0, 0, 0, 0, 0, 2 / (b.maxZ - b.minZ), 0, 0, -2 / depth, 0, 1 + 2 * low / depth, 0, 0, 0, 1);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        return camera;
    }

    // tiles whose surface a block needs: the overview tile for coarse pages, otherwise the rendered leaves under the block and its gutter. For every
    // block of the frame each tile draws only the triangle rows under that block (none elsewhere): its onBeforeRender sets the range per block
    // camera, so the vertex work is the sum of the blocks' rows, not their union times the block count
    #batchProxies(blocks, coarse) {
        const tiles = this.tiles, models = coarse ? [{ model: tiles.root, descriptor: this.stream.descriptors.get(this.stream.manifest.overviewId) }] : tiles.leaves;
        const bounds = blocks.map(block => this.#blockBounds(block));
        const used = [];
        for (const { model, descriptor } of models) {
            const b = descriptor.bounds, dz = (b.maxZ - b.minZ) / (descriptor.rows - 1), rowIndices = 6 * (descriptor.columns - 1);
            const ranges = bounds.map(block => {
                if (block.maxX < b.minX || block.minX > b.maxX || block.maxZ < b.minZ || block.minZ > b.maxZ) return null;
                const first = Math.max(0, Math.floor((b.maxZ - block.maxZ) / dz) - 1), last = Math.min(descriptor.rows - 2, Math.ceil((b.maxZ - block.minZ) / dz));
                return [first * rowIndices, (last - first + 1) * rowIndices];
            });
            if (!ranges.some(Boolean)) continue;
            let proxy = this.proxies.get(model);
            if (!proxy) {
                proxy = new THREE.Mesh(model.mesh.geometry, this.program.material);
                proxy.frustumCulled = false;
                proxy.matrixAutoUpdate = false;
                proxy.onBeforeRender = (renderer, scene, camera, geometry) => {
                    const range = proxy.userData.ranges?.[camera.userData.batchIndex];
                    geometry.setDrawRange(range ? range[0] : 0, range ? range[1] : 0);
                };
                this.proxies.set(model, proxy);
                this.scene.add(proxy);
            }
            used.push({ proxy, geometry: model.mesh.geometry, ranges });
        }
        return used;
    }

    // an unpack camera: its viewport is the destination slot and its projection matrix carries the scratch and atlas origins of the page
    #unpackCamera(index, source, destination, level) {
        let camera = this.unpackCameras[index];
        if (!camera) {
            camera = new THREE.Camera();
            camera.matrixAutoUpdate = false;
            camera.matrixWorldAutoUpdate = false;
            camera.viewport = new THREE.Vector4();
            this.unpackCameras[index] = camera;
        }
        const size = LANDSCAPE_SURFACE_CACHE.slotTexels / 2 ** level;
        camera.projectionMatrix.identity();
        camera.projectionMatrix.elements[12] = source.x; camera.projectionMatrix.elements[13] = source.y;
        camera.projectionMatrix.elements[14] = destination.x; camera.projectionMatrix.elements[15] = destination.y;
        camera.viewport.set(destination.x, destination.y, size, size);
        return camera;
    }

    // generation of the frame's blocks into the packed scratch (by geometry class), then unpacking each page from its block into its atlas slots:
    // level 0 copied, level 1 and the response atlas box-filtered (by atlas layer). Only blocks reaching beyond the landscape are cleared to the
    // neutral texel first; elsewhere the tiles cover every texel of a block
    #render(blocks, selected, quota) {
        const renderer = this.renderer, gl = renderer.getContext(), state = renderer.state, autoClear = renderer.autoClear;
        const query = this.timer && !this.gpu.pending.length ? gl.createQuery() : null;
        if (query) gl.beginQuery(this.timer.TIME_ELAPSED_EXT, query);
        renderer.autoClear = false;
        const pages = selected.map(page => ({ ...page, position: landscapeSurfaceCacheSlotPosition(this.layout, page.slot), source: landscapeSurfaceCacheBlockPageOrigin(page.block, page) }));
        try {
            renderer.setRenderTarget(this.scratch.target);
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
            for (const coarse of [true, false]) {
                const group = blocks.filter(block => (block.mip >= LANDSCAPE_SURFACE_CACHE.overviewGeometryMip) === coarse);
                if (!group.length) continue;
                const proxies = this.#batchProxies(group, coarse), saved = new Map();
                if (!proxies.length) continue;
                for (const proxy of this.proxies.values()) proxy.visible = false;
                for (const entry of proxies) {
                    entry.proxy.visible = true;
                    entry.proxy.userData.ranges = entry.ranges;
                    if (!saved.has(entry.geometry)) saved.set(entry.geometry, { start: entry.geometry.drawRange.start, count: entry.geometry.drawRange.count });
                }
                try {
                    this.arrayCamera.cameras = group.map((block, index) => {
                        const camera = this.#blockCamera(index, block);
                        camera.viewport.set(block.origin.x, block.origin.y, block.width, block.height);
                        camera.userData.batchIndex = index;
                        return camera;
                    });
                    renderer.render(this.scene, this.arrayCamera);
                } finally {
                    for (const [geometry, range] of saved) geometry.setDrawRange(range.start, range.count);
                }
            }
            const uniforms = this.unpackMaterial.uniforms;
            for (const level of [0, 1]) {
                uniforms.uSurfaceCacheLevel.value = level;
                for (let layer = 0; layer < this.layout.layers; layer++) {
                    const group = pages.filter(page => page.position.layer === layer);
                    if (!group.length) continue;
                    this.arrayCamera.cameras = group.map((page, index) => this.#unpackCamera(index, page.source,
                        level ? { x: page.position.x1, y: page.position.y1 } : { x: page.position.x0, y: page.position.y0 }, level));
                    this.framebuffers[layer][level].forEach((target, format) => {
                        uniforms.uSurfaceCacheTarget.value = format;
                        this.unpackMaterial.uniformsNeedUpdate = true;
                        renderer.setRenderTarget(target.target);
                        renderer.render(this.unpackScene, this.arrayCamera);
                    });
                }
            }
        } finally {
            renderer.setRenderTarget(null);
            renderer.autoClear = autoClear;
            this.arrayCamera.cameras = [];
            if (query) { gl.endQuery(this.timer.TIME_ELAPSED_EXT); this.gpu.pending.push({ query, pages: selected.length, blocks: blocks.length, quota, frame: this.frame }); }
        }
        this.stats.blocksLastFrame = blocks.length;
    }

    #pollTimer() {
        if (!this.timer) return;
        const gl = this.renderer.getContext();
        while (this.gpu.pending.length) {
            const entry = this.gpu.pending[0];
            if (!gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) break;
            this.gpu.pending.shift();
            const disjoint = gl.getParameter(this.timer.GPU_DISJOINT_EXT), ms = gl.getQueryParameter(entry.query, gl.QUERY_RESULT) / 1e6;
            gl.deleteQuery(entry.query);
            if (disjoint) { this.gpu.disjoint++; continue; }
            this.gpu.lastMs = ms;
            this.gpu.maxMs = Math.max(this.gpu.maxMs, ms);
            this.gpu.samples.push({ ms, pages: entry.pages, blocks: entry.blocks });
            this.gpu.total = (this.gpu.total ?? 0) + 1;
            if (this.gpu.samples.length > 240) this.gpu.samples.shift();
            this.gpu.perPageMs = this.gpu.perPageMs === null ? ms / entry.pages : .7 * this.gpu.perPageMs + .3 * ms / entry.pages;
            // a batch that filled its quota says how many pages fit the budget; a short batch (the backlog ran out) only lowers it when over budget
            const target = entry.pages * RUNTIME.generationBudgetMs / Math.max(ms, 1e-3);
            if (entry.pages >= RUNTIME.quotaFullFraction * entry.quota || ms > RUNTIME.generationBudgetMs) {
                this.gpu.quota = Math.min(RUNTIME.maximumPagesPerFrame, Math.max(1, (1 - RUNTIME.quotaGain) * this.gpu.quota + RUNTIME.quotaGain * target));
            }
        }
    }

    // the indirection uploads in the frame its pages publish (a reused slot must never be read through a stale entry); at most one 16 KiB layer per
    // mip, so it is always admitted and only counted against the frame's upload allowance
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
        let stale = 0, resident = 0;
        for (const record of this.residency.pages.values()) { residentByMip[record.mip]++; resident++; if (record.stale) stale++; }
        let missing = 0, staleDesired = 0;
        for (const page of this.desired) { desiredByMip[page.mip]++; const record = this.residency.get(page.key); if (!record) missing++; else if (record.stale) staleDesired++; }
        const samples = this.gpu.samples.map(sample => sample.ms), entries = this.budget.snapshot().entries;
        const settled = this.status === 'active' && this.program.ready && missing === 0 && staleDesired === 0 && !this.dirty.size;
        return {
            recipe: LANDSCAPE_SURFACE_CACHE.id, runtime: RUNTIME.id, demandRecipe: LANDSCAPE_SURFACE_CACHE_DEMAND.id, status: this.status, reason: this.reason, ready: this.ready, settled,
            // the cached frame program draws the cache (instead of the vertex-color bootstrap) only while this is set: the root page is resident and uploaded
            frameReady: this.appearance?.uniforms.uSurfaceCacheState.value.x === 1,
            geometry: { ...this.geometry, pageTexels: LANDSCAPE_SURFACE_CACHE.pageTexels, gutterTexels: LANDSCAPE_SURFACE_CACHE.gutterTexels, windowPages: LANDSCAPE_SURFACE_CACHE.windowPages },
            atlas: { slots: this.layout.slots, targetSlots: this.fit.targetSlots, layers: this.layout.layers, layerTexels: this.layout.layerTexels, slotTexels: LANDSCAPE_SURFACE_CACHE.slotTexels,
                slotBytes: this.layout.slotBytes, bytes: this.fit.atlasBytes, scratchBytes: this.fit.scratchBytes, gpuBytes: this.fit.gpuBytes, ceilingBytes: this.fit.ceilingBytes,
                fitReason: this.fit.reason, formats: LANDSCAPE_SURFACE_CACHE.formats,
                anisotropy: this.anisotropy, anisotropySupported: this.anisotropySupported },
            indirection: { bytes: this.fit.indirectionBytes, center: this.center ? { ...this.center } : null, rebuilds: this.indirection.rebuilds, uploaded: this.indirectionUploaded },
            ledger: { atlas: entries.find(entry => entry.key === this.atlasKey) ?? null, indirection: entries.find(entry => entry.key === this.indirectionKey) ?? null },
            pages: { resident, stale, desired: this.desired.length, missing, staleDesired, unstable: this.pendingUnstable ?? 0, residentByMip, desiredByMip, freeSlots: this.residency.freeSlots,
                evictions: this.residency.evictions, capacityLimited: !!this.capacityLimited },
            misses: missing,
            generation: { program: { ready: this.program.ready, milliseconds: this.program.milliseconds, timedOut: this.program.timedOut, compiles: this.program.compiles },
                pagesTotal: this.stats.pagesGenerated, pagesLastFrame: this.stats.pagesLastFrame, regenerated: this.stats.regenerated, framesWithGeneration: this.stats.framesWithGeneration,
                cpuMsLastFrame: this.stats.generationCpuMs, peakCpuMs: this.stats.peakGenerationCpuMs, gpuSupported: this.gpu.supported, gpuMsLast: this.gpu.lastMs, gpuMsMax: this.gpu.maxMs,
                gpuMsMedian: median(samples), gpuMsPerPage: this.gpu.perPageMs, gpuSamples: this.gpu.total ?? samples.length,
                recent: this.gpu.samples.slice(-32).map(sample => [sample.ms, sample.pages, sample.blocks]), disjoint: this.gpu.disjoint, budgetMs: RUNTIME.generationBudgetMs, quota: this.quota,
                blocksLastFrame: this.stats.blocksLastFrame,
                rootGeneratedAtMs: this.stats.rootGeneratedAtMs, unstableSkips: this.stats.unstableSkips, capacityStops: this.stats.capacityStops },
            demand: { ...(this.lastPlan ?? {}), updates: this.stats.demandUpdates, ms: this.stats.demandMs, anisotropy: this.anisotropy },
            identity: { global: this.globalKey, flushes: this.stats.flushes, checks: this.stats.identityChecks, dirty: this.dirty.size },
            cpuMs: this.stats.cpuMs, cpu: { lastMs: this.stats.cpuMs, ...cpuWindow(this.cpuSamples) }, uploadBytes: this.stats.uploadBytes, microSoil: this.#microSoil()
        };
    }

    /** CPU mirror of the frame's lookup at a world position for a footprint (inspection). @param {number} x @param {number} z @param {number} footprint */
    lookup(x, z, footprint) {
        if (!this.available || !this.center) return null;
        const vx = x - this.geometry.originX, vz = z - this.geometry.originZ;
        let mip = Math.min(this.geometry.rootMip, Math.max(0, Math.floor(Math.log2(Math.max(footprint, 1e-9) / this.geometry.texel0Meters))));
        while (mip < this.geometry.rootMip) {
            const size = landscapeSurfaceCachePageMeters(this.geometry, mip), origin = this.indirection.origins[mip], px = Math.floor(vx / size), pz = Math.floor(vz / size);
            if (origin && px >= origin.x && pz >= origin.z && px < origin.x + LANDSCAPE_SURFACE_CACHE.windowPages && pz < origin.z + LANDSCAPE_SURFACE_CACHE.windowPages) break;
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
        if (!this.layout) return;
        const gl = this.renderer.getContext();
        for (const entry of this.gpu.pending) gl.deleteQuery(entry.query);
        this.gpu.pending = [];
        for (const pass of [...this.framebuffers.flat(2), this.scratch]) { gl.deleteFramebuffer(pass.framebuffer); this.renderer.properties.remove(pass.target); }
        for (const texture of [...Object.values(this.glTextures), this.scratchTexture]) gl.deleteTexture(texture);
        for (const texture of [...Object.values(this.textures), this.scratchExternal]) texture.dispose();
        this.unpackMaterial.dispose();
        this.unpackMesh.geometry.dispose();
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
