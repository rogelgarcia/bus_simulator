// Streams view-dependent soil masks and shared PBR pages independently from mesh tessellation.
// @ts-check
// Generated fine surface-detail pages extend the mask array when the configured levels, device slots and appearance GPU
// headroom allow; their two module workers have their contexts reserved before creation, and the recipe warp is shared
// with the terrain shader so native and coarser coverage meander exactly like the generated pages. Material clump relief
// uses the same landscape seed once the soil bindings are known; soils without relief metadata keep plain coverage. The
// stochastic material tiling is seeded from that seed as well; its compile-time mode lives in the terrain programs, so
// the view keeps this record and the geometry streamer's materials in step. AI577 D4 separates three appearance layers: the
// landscape-scale macro field (one per landscape seed), every material at its physical period with slope-adaptive projection and
// normal mip filtering, and close-up micro detail paired with each tier by the optional companion multiscale sidecar, which also adds
// 1024-pixel tiers; its absence, failure or budget refusal falls back to the schema-1 tiers with an explicit reason. Each material
// requests its tier from the projected density of the visible pages where it occurs, and the requests are fitted to the appearance
// ceilings level by level (LandscapeAppearanceDemand) before materials stream toward their fitted tiers. AI577 D5 terrain-field pages stream
// beside the resident native mask pages (LandscapeTerrainFieldPages) into their own array; a missing sidecar leaves them explicitly absent.
// Planning-only cover displays the terrain-driven natural soil of the shared LandscapeNaturalInference source (ready before the first
// mask request) in native and generated pages alike, with its explicit per-native overview fallback reported as `presentation`. The terrain-driven
// natural appearance (LandscapeTerrainAppearance) reads the resident root field and mask pages; this adapter mirrors it in JavaScript
// (terrainAppearanceSample), evaluates the landscape-dressing-inputs v1 of the displayed soil (dressingSample) and lends the exposed-rock soil the
// density of visible pages whose fields expose rock, so revealed rock streams at the tier its pages need.
import { createLandscapeAppearancePlanner, loadLandscapeAppearanceManifest, loadLandscapeAppearanceMultiscale, createLandscapeSurfaceDetailIndex, landscapeSurfaceDetailRecipeHash } from '../../../app/landscape/index.js';
import { LandscapeAppearanceBudget } from './LandscapeAppearanceBudget.js';
import { LANDSCAPE_APPEARANCE_DEMAND, planLandscapeAppearanceDemand } from './LandscapeAppearanceDemand.js';
import { createLandscapeAppearanceUniforms, setLandscapeMacroVariationUniforms, setLandscapeMaterialClumpUniforms, setLandscapeMaterialSamplingUniforms, setLandscapeSurfaceLayerUniforms,
    setLandscapeSurfaceWarpUniforms, LANDSCAPE_MASK_SLOTS, LANDSCAPE_SOIL_SLOTS } from './LandscapeAppearanceUniforms.js';
import { LANDSCAPE_MACRO_VARIATION, landscapeMacroVariationUniforms } from './LandscapeMacroVariation.js';
import { LANDSCAPE_MICRO_DETAIL } from './LandscapeMicroDetail.js';
import { LANDSCAPE_NORMAL_FILTERING, LANDSCAPE_SURFACE_PROJECTION, landscapeProjectionActivationDegrees, landscapeSurfaceLayerUniforms } from './LandscapeSurfaceLayers.js';
import { LANDSCAPE_MULTISCALE_CAPABILITY, resolveLandscapeMultiscaleTiers } from './LandscapeMultiscaleTiers.js';
import { LANDSCAPE_MATERIAL_SAMPLING, landscapeMaterialSamplingDefinition, landscapeMaterialSamplingMode, landscapeMaterialSamplingSalt, landscapeMaterialSamplingUniforms } from './LandscapeMaterialSampling.js';
import { LANDSCAPE_MATERIAL_CLUMPS, landscapeMaterialClumpDefinition, landscapeMaterialClumpUniforms } from './LandscapeMaterialBlend.js';
import { LandscapeMaskPages } from './LandscapeMaskPages.js';
import { LandscapeMaterialPages } from './LandscapeMaterialPages.js';
import { LandscapeWorkerPool } from './LandscapeWorkerPool.js';
import { LandscapeTerrainFieldPages, landscapeTerrainFieldProgress } from './LandscapeTerrainFieldPages.js';
import { createLandscapeTerrainFieldTexture } from './LandscapeTerrainFieldTexture.js';
import { landscapeCameraSnapshot } from './LandscapeStreamer.js';
import { LANDSCAPE_NATURAL_PRESENTATION, LANDSCAPE_NATURAL_TERRAIN_INFERENCE, landscapeNaturalPresentationBytes } from './LandscapeNaturalPresentation.js';
import { LANDSCAPE_NATURAL_INFERENCE, acquireLandscapeNaturalInference, landscapeNaturalInferenceMode } from './LandscapeNaturalInference.js';
import { LANDSCAPE_NATURAL_SOIL, landscapeNaturalSoilPageBytes } from '../../../app/landscape/LandscapeNaturalSoil.js';
import { landscapeCoverageMaskLayout } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, landscapeSurfaceDetailSeed, landscapeSurfaceWarpUniforms } from './LandscapeSurfaceDetailRecipe.js';
import { createLandscapeSurfaceWarp } from './LandscapeSurfaceNoise.js';
import { LANDSCAPE_SURFACE_DETAIL_RUNTIME, landscapeSurfaceDetailCapacity, landscapeSurfaceDetailDisabledSnapshot, landscapeSurfaceDetailWorkerBytes } from './LandscapeSurfaceDetailPages.js';
import { LANDSCAPE_TERRAIN_APPEARANCE, decodeLandscapeAppearanceLayer, landscapeAppearanceLayerUnits, landscapePlanningCover, landscapePlanningCoverMask, landscapeRockFactor,
    landscapeSoilCatenaShare, landscapeSoilTerrainRole, landscapeTerrainAppearanceInputs, landscapeTerrainFreshness } from './LandscapeTerrainAppearance.js';
import { sampleLandscapeDressingInputs } from '../../../app/landscape/index.js';
import { LANDSCAPE_SURFACE_CACHE_OFF } from './LandscapeSurfaceCache.js';

export class LandscapeAppearanceStreamer {
    /**
     * @param {{loaded:any,budget:any,renderer:any,coverageSlots:{total:number,native:number,detail:number,detailMax:number,maxFragmentUniforms:number},appearanceUrl?:string,
     *   surfaceDetail?:{levels:number},detailCache?:any,materialSampling?:string,multiscale?:'auto'|'off',terrainFields?:'auto'|'off',naturalInference?:'terrain'|'overview'}} options
     *   detailCache is the view-owned LandscapeSurfaceDetailCache (or null); materialSampling is the compile-time mode of the view's terrain programs;
     *   multiscale 'off' keeps the schema-1 tiers without requesting the companion sidecar; terrainFields 'off' never streams terrain-field pages (the
     *   natural inference of planning-only cover keeps its own policy); naturalInference is the view's natural display policy, shared with the geometry stream
     */
    constructor({ loaded, budget, renderer, coverageSlots, appearanceUrl, surfaceDetail = { levels: 0 }, detailCache = null, materialSampling = LANDSCAPE_MATERIAL_SAMPLING.defaultMode, multiscale = 'auto', terrainFields = 'auto',
        naturalInference = LANDSCAPE_NATURAL_INFERENCE.defaultMode }) {
        Object.assign(this, { loaded, renderer });
        if (!['auto', 'off'].includes(multiscale)) throw new Error(`[Landscape] multiscale must be auto or off; received ${multiscale}`);
        this.multiscaleMode = multiscale;
        this.layers = { macro: true, micro: true, projection: true, normalFiltering: true };
        landscapeMaterialSamplingMode(materialSampling);
        this.materialSampling = materialSampling;
        this.coverageSlots = coverageSlots;
        this.uniforms = createLandscapeAppearanceUniforms(coverageSlots?.total);
        // AI577 D6: the surface cache indirection placeholder this appearance owns; a bound cache swaps its own texture into the cell, so disposal
        // releases the placeholder, never the cell's current texture
        this.surfaceCachePlaceholder = this.uniforms.uSurfaceCacheIndirection.value;
        // AI577 D5: planning-only cover excludes the graded design terrain from the terrain-driven appearance terms
        this.planningCoverMask = landscapePlanningCoverMask(loaded.manifest.landCover.catalog);
        this.uniforms.uPlanningCover.value.set(this.planningCoverMask);
        this.resolveBindingFallback = appearanceUrl === undefined;
        this.appearanceUrl = this.resolveBindingFallback ? new URL('./appearance/manifest.json', loaded.manifestUrl).href : appearanceUrl;
        this.multiscaleUrl = new URL('./multiscale.json', this.appearanceUrl).href;
        if (!['auto', 'off'].includes(terrainFields)) throw new Error(`[Landscape] terrainFields must be auto or off; received ${terrainFields}`);
        this.terrainFieldsMode = terrainFields;
        this.fieldsUrl = new URL('./fields/manifest.json', loaded.manifestUrl).href;
        this.prefix = `appearance/${crypto.randomUUID()}`;
        this.recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE;
        if (!Number.isSafeInteger(surfaceDetail?.levels) || surfaceDetail.levels < 0 || surfaceDetail.levels > this.recipe.levels) throw new Error(`[Landscape] surfaceDetail.levels must be an integer from 0 to ${this.recipe.levels}`);
        this.detailLevels = surfaceDetail.levels;
        this.detailCache = detailCache;
        this.recipeHash = landscapeSurfaceDetailRecipeHash(this.recipe);
        this.seed = landscapeSurfaceDetailSeed(loaded.manifest.id, this.recipe);
        this.warpUniforms = landscapeSurfaceWarpUniforms(this.recipe, this.seed);
        this.warp = createLandscapeSurfaceWarp({ seed: this.seed, wavelengths: [...this.recipe.warp.wavelengths], amplitudes: [...this.recipe.warp.amplitudes], shaping: this.recipe.warp.shaping });
        setLandscapeSurfaceWarpUniforms(this.uniforms, this.warpUniforms, true);
        this.detailReason = this.detailLevels ? null : 'surface-detail-off';
        this.budget = new LandscapeAppearanceBudget(budget, this.prefix);
        // shared with the geometry stream of the same load (its fallback colors use the same natural soil policy)
        this.naturalHandle = acquireLandscapeNaturalInference(loaded, { ledger: budget, mode: landscapeNaturalInferenceMode(naturalInference) });
        this.natural = this.naturalHandle.source;
        this.abort = new AbortController();
        this.errors = [];
        this.materialTierHistory = {};
        this.lastDemand = null;
        this.uploadedBytes = 0;
        this.peakUploadedBytes = 0;
        this.frameCostMs = 0;
    }

    async initialize() {
        const key = `${this.prefix}/manifest`;
        try {
            const admission = this.budget.reserve(key, { cpuBytes: 768 * 1024, gpuBytes: 0, kind: 'appearance-manifest-decode' });
            if (!admission.admitted) throw new Error(`Appearance manifest cannot fit: ${admission.reason}`);
            this.appearance = await loadLandscapeAppearanceManifest(this.appearanceUrl, { landscape: this.loaded.manifest, signal: this.abort.signal, resolveBindingFallback: this.resolveBindingFallback });
            if (this.disposed) return;
            if (this.appearance.materials.length !== LANDSCAPE_SOIL_SLOTS) throw new Error(`Landscape PBR adapter currently supports exactly ${LANDSCAPE_SOIL_SLOTS} soil bindings`);
            const root = { descriptor: this.loaded.chunk.descriptor, landCover: this.loaded.chunk.landCover };
            const sourceSoils = new Set(root.landCover);
            this.provisionalSoils = new Set(this.loaded.manifest.soil.landCoverMapping.filter(entry => sourceSoils.has(entry.landCoverId))
                .map(entry => this.loaded.manifest.soil.catalog.findIndex(soil => soil.id === entry.soilId)));
            await this.natural.ready;
            if (this.disposed) return;
            // the worker context also keeps a bounded content-addressed cache of natural-soil pages while terrain-driven natural soil is active
            this.naturalWorkerPages = this.natural.active ? LANDSCAPE_NATURAL_SOIL.appearanceWorkerPages : 0;
            const contextAdmission = this.budget.reserve(`${this.prefix}/natural-overview-worker`, { cpuBytes: root.landCover.byteLength + landscapeNaturalPresentationBytes(root.descriptor).workingBytes
                + this.naturalWorkerPages * landscapeNaturalSoilPageBytes(root.descriptor), gpuBytes: 0, kind: 'appearance-natural-worker-context' });
            if (!contextAdmission.admitted) throw new Error(`Natural appearance worker cannot fit: ${contextAdmission.reason}`);
            const capacity = this.budget.limits.gpuBytes < 8 * 1024 * 1024 ? 5 : LANDSCAPE_MASK_SLOTS;
            const detail = this.createSurfaceDetail(root, capacity);
            const companion = await this.loadMultiscale();
            if (this.disposed) return;
            this.pool = new LandscapeWorkerPool({ size: 1, workerUrl: new URL('./LandscapeAppearanceWorker.js', import.meta.url), context: { type: 'initialize', manifest: this.loaded.manifest, manifestUrl: this.loaded.manifestUrl,
                appearanceUrl: this.appearanceUrl, multiscaleUrl: companion.sidecar ? this.multiscaleUrl : null, multiscalePageBytes: LANDSCAPE_MULTISCALE_CAPABILITY.maxPageBytes, fieldsUrl: this.fieldsUrl, root,
                naturalPages: this.naturalWorkerPages } });
            this.masks = new LandscapeMaskPages({ loaded: this.loaded, budget: this.budget, pool: this.pool, renderer: this.renderer, uniforms: this.uniforms, prefix: this.prefix, capacity, detail, warp: this.warp,
                natural: this.natural });
            if (detail && !this.masks.detail) this.releaseSurfaceDetail(this.masks.detailDegradation);
            this.multiscale = resolveLandscapeMultiscaleTiers({ appearance: this.appearance, sidecar: companion.sidecar, error: companion.error, enabled: this.multiscaleMode === 'auto',
                maxTextureSize: this.renderer.capabilities.maxTextureSize, limits: this.budget.limits, fixedGpuBytes: this.masks.pixels.byteLength });
            this.materials = new LandscapeMaterialPages({ appearance: this.appearance, multiscale: this.multiscale, budget: this.budget, pool: this.pool, renderer: this.renderer, uniforms: this.uniforms, prefix: this.prefix });
            await this.materials.initialize();
            if (!this.disposed) {
                this.fields = new LandscapeTerrainFieldPages({ loaded: this.loaded, shared: this.budget.shared, masks: this.masks, pool: this.pool, renderer: this.renderer, uniforms: this.uniforms,
                    prefix: this.prefix, url: this.fieldsUrl, mode: this.terrainFieldsMode, createTexture: createLandscapeTerrainFieldTexture,
                    ...(this.natural.url === this.fieldsUrl ? { loadSidecar: () => this.natural.sidecar() } : {}) });
                await this.fields.initialize();
            }
            if (!this.disposed) {
                this.macroUniforms = landscapeMacroVariationUniforms({ seed: this.seed, soils: this.appearance.materials.map(definition => ({ soilId: definition.soilId })) });
                this.applySurfaceLayers();
                this.clumpUniforms = landscapeMaterialClumpUniforms({ seed: this.seed, soils: this.appearance.materials.map(definition => ({ soilId: definition.soilId, enabled: !!definition.height })) });
                setLandscapeMaterialClumpUniforms(this.uniforms, this.clumpUniforms, true);
                this.samplingUniforms = landscapeMaterialSamplingUniforms({ seed: this.seed, soils: this.appearance.materials.map(definition => ({ soilId: definition.soilId, enabled: true })) });
                setLandscapeMaterialSamplingUniforms(this.uniforms, this.samplingUniforms, true);
                this.planner = createLandscapeAppearancePlanner(this.loaded.manifest, this.appearance, { materialTiers: this.materials.materialTiers(),
                    materialTiling: Object.fromEntries(Object.entries(this.materials.tiling).map(([soilId, tiling]) => [soilId, { tileMeters: tiling.tileMeters }])),
                    ...(this.masks.detail ? { surfaceDetail: { levels: this.detailLevels } } : {}) });
                this.initialized = true;
            }
        } catch (error) {
            if (error.name !== 'AbortError' && !this.disposed) this.errors.push({ message: error.message });
            this.releaseResources();
        } finally { if (!this.disposed && this.budget) this.budget.release(key); }
    }

    // the companion multiscale sidecar is optional: a 404 resolves to null, while load or validation failures are kept as the explicit
    // fallback reason; its bounded metadata decode is reserved like the appearance manifest
    async loadMultiscale() {
        if (this.multiscaleMode === 'off') return { sidecar: null, error: null };
        const key = `${this.prefix}/multiscale-manifest`, admission = this.budget.reserve(key, { cpuBytes: 768 * 1024, gpuBytes: 0, kind: 'appearance-multiscale-manifest-decode' });
        if (!admission.admitted) return { sidecar: null, error: `multiscale-manifest-${admission.reason}` };
        try { return { sidecar: await loadLandscapeAppearanceMultiscale(this.multiscaleUrl, { appearance: this.appearance, signal: this.abort.signal }), error: null }; }
        catch (error) {
            if (error.name === 'AbortError') throw error;
            return { sidecar: null, error: `${error.name === 'LandscapeAppearanceMultiscaleBindingError' ? 'multiscale-binding-mismatch' : 'multiscale-sidecar-invalid'}: ${error.message}` };
        } finally { if (!this.disposed && this.budget) this.budget.release(key); }
    }

    applySurfaceLayers() {
        setLandscapeMacroVariationUniforms(this.uniforms, this.macroUniforms, this.layers.macro);
        setLandscapeSurfaceLayerUniforms(this.uniforms, landscapeSurfaceLayerUniforms({ projection: this.layers.projection, normalFiltering: this.layers.normalFiltering }));
        this.materials.setMicroEnabled(this.layers.micro);
    }

    /**
     * Enables or disables the D4 appearance layers for A/B evidence; omitted keys keep their state.
     * @param {{macro?:boolean,micro?:boolean,projection?:boolean,normalFiltering?:boolean}} layers
     */
    setSurfaceLayers(layers) {
        if (!this.macroUniforms) throw new Error('[Landscape] Surface layers are configured once the appearance materials are initialized');
        if (!layers || typeof layers !== 'object' || !Object.entries(layers).every(([key, value]) => Object.hasOwn(this.layers, key) && typeof value === 'boolean')) {
            throw new Error(`[Landscape] Surface layers accept boolean ${Object.keys(this.layers).join(', ')}`);
        }
        Object.assign(this.layers, layers);
        this.applySurfaceLayers();
    }

    surfaceLayerSnapshot() {
        return { macro: { enabled: this.layers.macro, recipe: LANDSCAPE_MACRO_VARIATION.id, seed: this.seed, wavelengthsMeters: LANDSCAPE_MACRO_VARIATION.octaves.map(octave => octave.wavelengthMeters),
                fadeWavelengths: [LANDSCAPE_MACRO_VARIATION.fadeStartWavelengths, LANDSCAPE_MACRO_VARIATION.fadeEndWavelengths], materials: LANDSCAPE_MACRO_VARIATION.materials },
            micro: { enabled: this.layers.micro, recipe: LANDSCAPE_MICRO_DETAIL.id, encoding: LANDSCAPE_MICRO_DETAIL.encoding, fadePeriods: [LANDSCAPE_MICRO_DETAIL.fadeStartPeriods, LANDSCAPE_MICRO_DETAIL.fadeEndPeriods],
                footprint: LANDSCAPE_MICRO_DETAIL.footprint, sampling: LANDSCAPE_MICRO_DETAIL.sampling },
            projection: { enabled: this.layers.projection, recipe: LANDSCAPE_SURFACE_PROJECTION.id, sharpness: LANDSCAPE_SURFACE_PROJECTION.sharpness, activationDegrees: landscapeProjectionActivationDegrees() },
            normalFiltering: { enabled: this.layers.normalFiltering, recipe: LANDSCAPE_NORMAL_FILTERING.id, strength: LANDSCAPE_NORMAL_FILTERING.strength, model: LANDSCAPE_NORMAL_FILTERING.model } };
    }

    multiscaleSnapshot() {
        const resolved = this.multiscale;
        if (!resolved) return { status: 'pending', reason: 'appearance-not-initialized', active: false, url: this.multiscaleUrl, mode: this.multiscaleMode };
        return { status: resolved.status, reason: resolved.reason, active: resolved.active, url: this.multiscaleUrl, mode: this.multiscaleMode, revision: resolved.revision ?? null, capabilities: resolved.capabilities ?? null,
            maxResolution: resolved.maxResolution, workingSetBytes: resolved.workingSetBytes ?? null, failures: this.materials?.multiscaleFailures ?? [],
            materials: resolved.materials.map(material => ({ soilId: material.soilId, materialId: material.materialId, maps: material.maps, micro: material.micro, tiers: material.tiers.map(tier => tier.resolution) })) };
    }

    // fine slot capacity, both worker contexts and the detail pool; explicit reasons replace silent omission
    createSurfaceDetail(root, nativeCapacity) {
        const pageBytes = landscapeCoverageMaskLayout(root.descriptor).pageBytes;
        const sizing = landscapeSurfaceDetailCapacity({ levels: this.detailLevels, coverageSlots: this.coverageSlots, limits: this.budget.limits, pageBytes, nativeCapacity, materials: this.appearance.materials });
        this.detailSizing = sizing;
        if (!sizing.capacity) { this.detailReason = sizing.reason; return null; }
        const manifest = this.loaded.manifest, contextBytes = landscapeSurfaceDetailWorkerBytes(root.descriptor, (manifest.grid.chunkIntervals + 1) ** 2, { naturalSoil: this.natural.active }), keys = [];
        for (let index = 0; index < LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers; index++) {
            const key = `${this.prefix}/surface-detail-worker/${index}`, admission = this.budget.reserve(key, { cpuBytes: contextBytes, gpuBytes: 0, kind: 'appearance-surface-detail-worker-context' });
            if (!admission.admitted) { for (const reserved of keys) this.budget.release(reserved); this.detailReason = `surface-detail-worker-${admission.reason}`; return null; }
            keys.push(key);
        }
        this.detailWorkerKeys = keys;
        this.detailPool = new LandscapeWorkerPool({ size: LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers, workerUrl: new URL('./LandscapeSurfaceDetailWorker.js', import.meta.url),
            context: { type: 'initialize', manifest, manifestUrl: this.loaded.manifestUrl, root, recipe: this.recipe, seed: this.seed, coverPages: LANDSCAPE_SURFACE_DETAIL_RUNTIME.workerCoverPages } });
        return { capacity: sizing.capacity, pool: this.detailPool, cache: this.detailCache, index: createLandscapeSurfaceDetailIndex(manifest, { levels: this.detailLevels }),
            recipe: this.recipe, recipeHash: this.recipeHash, seed: this.seed, levels: this.detailLevels, workerContextBytes: contextBytes * LANDSCAPE_SURFACE_DETAIL_RUNTIME.workers, natural: this.natural };
    }

    releaseSurfaceDetail(reason) {
        this.detailPool?.dispose();
        this.detailPool = null;
        for (const key of this.detailWorkerKeys ?? []) this.budget.release(key);
        this.detailWorkerKeys = [];
        this.detailReason = reason;
    }

    prepare(camera, viewportHeight) {
        if (!this.initialized || this.disposed) return;
        const started = performance.now();
        const snapshot = landscapeCameraSnapshot(camera, viewportHeight), detail = this.masks.detail;
        const plan = this.planner.plan(snapshot, { previousMaskIds: this.lastPlan?.desiredMaskIds ?? [], previousTiers: this.lastPlan?.desiredTiers ?? {},
            ...(detail ? { previousDetailIds: this.lastPlan?.detail?.desiredIds ?? [] } : {}) });
        this.lastPlan = plan;
        this.masks.plan(plan, snapshot);
        this.budget.protectDemand(this.materialDemand(plan));
        this.prepared = true;
        this.prepareCostMs = performance.now() - started;
    }

    // each material's texel demand from the visible pages where it occurs, fitted level by level to the appearance ceilings; before any
    // mask is resident the root cover's soils stand in at the view-wide tiers so their credit is protected before geometry refines
    materialDemand(plan) {
        const { interests, densityBySoil } = this.masks.interests(plan), detail = this.masks.detail, provisional = interests.size === 0;
        if (!provisional) this.addRockExposureInterests(plan, interests, densityBySoil);
        const desiredTiers = provisional ? plan.desiredTiers : this.planner.desiredMaterialTiers(densityBySoil, { previousTiers: this.materialTierHistory, targetTexelPixels: plan.targetTexelPixels });
        const composition = planLandscapeAppearanceDemand({
            fixedCpuBytes: this.masks.pixels.byteLength + this.loaded.chunk.landCover.byteLength + landscapeNaturalPresentationBytes(this.loaded.chunk.descriptor).workingBytes
                + (this.naturalWorkerPages ?? 0) * landscapeNaturalSoilPageBytes(this.loaded.chunk.descriptor) + (detail ? detail.workerContextBytes + detail.demandCpuBytes() : 0),
            fixedGpuBytes: this.masks.pixels.byteLength, decodeBytes: this.masks.decodeBytes ?? this.masks.layout.decodeBytes, limits: this.budget.limits,
            materials: this.materials.materials.map(material => {
                const soilId = material.definition.soilId, interested = provisional ? this.provisionalSoils.has(material.index) : interests.has(material.index);
                return { soilId, index: material.index, density: densityBySoil[soilId] ?? 0, pages: interests.get(material.index)?.size ?? 0,
                    desiredResolution: interested ? Number(desiredTiers[soilId]) : 32, heldResolution: this.materials.heldResolution(material),
                    resolutions: this.materials.streamableResolutions(material), maps: material.maps };
            })
        });
        return { ...composition, provisional, interests, densityBySoil, desiredTiers };
    }

    // AI577 D5: rock the terrain-driven appearance reveals through susceptible soils leases the exposed-rock soil at the density of each visible
    // native page whose resident fields expose rock (largest page exposure x susceptibility of its soils x the exposure gain above 0.02)
    addRockExposureInterests(plan, interests, densityBySoil) {
        const materials = this.appearance.materials, rock = materials.findIndex(definition => landscapeSoilTerrainRole(definition.soilId) < 0);
        if (rock < 0 || !this.fields?.active) return;
        const rockId = materials[rock].soilId, gain = LANDSCAPE_TERRAIN_APPEARANCE.rockExposure.gain;
        for (const id of plan.visibleMaskIds) {
            const record = this.masks.records.get(id), exposure = this.fields.rockExposure(id);
            if (!record || record.status !== 'resident' || !exposure) continue;
            const susceptibility = Math.max(0, ...[...record.soils].map(index => landscapeSoilTerrainRole(materials[index]?.soilId)));
            if (exposure * susceptibility * gain < .02) continue;
            if (!interests.has(rock)) interests.set(rock, new Set());
            interests.get(rock).add(id);
            densityBySoil[rockId] = Math.max(densityBySoil[rockId] ?? 0, record.progress === 1 ? plan.pixelsPerMeterById[id] ?? 0 : 0);
        }
    }

    update(dt, camera, viewportHeight, uploadAllowance) {
        if (!this.initialized || this.disposed) return;
        if (!this.prepared) this.prepare(camera, viewportHeight);
        const start = performance.now();
        this.prepared = false;
        const plan = this.lastPlan;
        this.uploadedBytes = this.masks.update(dt, uploadAllowance);
        const demand = this.materialDemand(plan);
        this.materials.interest(demand.interests, demand.desiredTiers, { fittedTiers: demand.fittedTiers, priorities: demand.densityBySoil, limitation: demand.reason });
        this.materialTierHistory = demand.provisional ? {} : demand.desiredTiers;
        this.lastDemand = demand;
        this.uploadedBytes += this.materials.update(dt, uploadAllowance - this.uploadedBytes);
        this.uploadedBytes += this.fields?.update(dt, uploadAllowance - this.uploadedBytes) ?? 0;
        this.uniforms.uAppearanceReady.value = this.masks.ready && this.materials.ready ? 1 : 0;
        this.peakUploadedBytes = Math.max(this.peakUploadedBytes, this.uploadedBytes);
        this.frameCostMs = performance.now() - start + this.prepareCostMs;
    }

    /**
     * Inputs of the AI577 D6 runtime surface cache (LandscapeSurfaceCacheInputs): every resident and uniform mask page with its identity, level,
     * bounds, fade progress and soils; each soil's bound tier, paired micro period and arriving tier; and the generation-relevant shared values,
     * without the per-slot arrays, the tier transition, the resident resolutions or the micro pairing, which pages carry themselves.
     */
    surfaceCacheInputs() {
        if (!this.initialized || this.disposed) return null;
        const manifest = this.loaded.manifest, u = this.uniforms, rootSpacing = this.loaded.chunk.descriptor.sampleStride * manifest.grid.spacingX;
        const levelSpacings = Array.from({ length: manifest.grid.maxLevel + 1 + (this.masks.detail ? this.detailLevels : 0) }, (_, level) => rootSpacing / 2 ** level);
        const slots = [], prefixLength = this.prefix.length + 1;
        for (const record of this.masks.records.values()) {
            if (record.status !== 'resident' && record.status !== 'uniform') continue;
            const uniform = record.status === 'uniform';
            slots.push({ id: record.id, key: record.kind === 'detail' ? `detail/${record.identity}` : record.key.slice(prefixLength), level: record.descriptor.level,
                bounds: record.descriptor.bounds, progress: uniform ? 1 : record.progress, soils: uniform ? [record.soil] : [...record.soils] });
        }
        const transition = this.materials.transition;
        const soils = this.materials.materials.map(material => {
            const tiling = u.uSoilTiling.value[material.index];
            return { index: material.index, soilId: material.definition.soilId, tileMeters: tiling.x, resolution: material.current?.resolution ?? 32, microTileMeters: tiling.y,
                microResolution: material.current?.resolution ?? 32, microLuminance: tiling.w, transitionResolution: transition?.material === material ? transition.target.resolution : null };
        });
        const vectors = list => list.flatMap(value => value.toArray()), rootField = landscapeTerrainFieldProgress(u.uMaskMeta.value[0].w);
        const global = { revision: this.appearance.revision, landscape: `${manifest.id}/${this.seed}`, natural: this.natural.active ? this.natural.snapshot().policy : 'overview',
            bindings: this.appearance.materials.map(definition => `${definition.soilId}=${definition.materialId}`),
            coverage: [...u.uCoverageSettings.value.toArray(), ...u.uCoverageFilter.value.toArray(), u.uCoveragePositiveClamp.value, u.uContourDistanceRange.value, ...u.uMaskDimensions.value.toArray()],
            soilScale: vectors(u.uSoilScale.value), soilTiling: u.uSoilTiling.value.map(value => value.x), soilAlbedo: vectors(u.uSoilAlbedo.value),
            soilRoughness: vectors(u.uSoilRoughness.value), soilRange: vectors(u.uSoilRange.value), soilState: u.uSoilState.value.flatMap(value => [value.x, value.w]),
            soilResponse: vectors(u.uSoilResponse.value), blend: [u.uSurfaceBlendEnabled.value, ...u.uSurfaceBlendSettings.value.toArray()],
            clumps: [...u.uSoilClumps.value, ...u.uSoilClumpSalts.value, ...u.uClumpOctaves.value, ...u.uClumpSettings.value, ...u.uClumpConfidence.value],
            sampling: [...u.uSoilStochastic.value, ...u.uSoilStochasticSalts.value, ...u.uStochasticSettings.value],
            macro: [...u.uMacroOctaves.value, ...u.uMacroSalts.value, ...u.uMacroSettings.value, ...u.uSoilMacro.value],
            layers: [...u.uSurfaceLayers.value, ...u.uMicroSampling.value, this.layers.micro ? 1 : 0],
            warp: [u.uSurfaceWarpEnabled.value, ...u.uLandscapeWarpWaves.value, ...u.uLandscapeWarpOffsets.value, ...u.uLandscapeWarpSalts.value],
            fields: [...u.uTerrainFieldsState.value.slice(0, 3), rootField === 1 ? 1 : 0], planning: [...u.uPlanningCover.value] };
        const rock = this.appearance.materials.findIndex(definition => landscapeSoilTerrainRole(definition.soilId) < 0);
        return { levelSpacings, slots, soils, rock, global, fieldsFading: rootField > 0 && rootField < 1, uniforms: u };
    }

    sample(x, z) { return this.masks?.sample(x, z) ?? null; }

    /** Exact JavaScript terrain-field sample (mirror of terrain_fields.glsl) over the resident field pages. @param {number} x @param {number} z @param {any} [options] */
    terrainFieldsSample(x, z, options) { return this.fields?.sample(x, z, options) ?? null; }

    coverageSample(x, z, options) { return this.masks?.coverageSample(x, z, options) ?? null; }

    /**
     * Exact JavaScript mirror of landscapeTerrainAppearance (chunks/landscape/terrain_appearance.glsl) at a world position over the resident landscape-scale
     * appearance layer (the root page's derived layer; slot 0 holds the root). soils lists the (tone, chroma) each catalog soil adds to its landscape-scale
     * field (soilMacroField: its catena share times the shared terms) and rockFactor the exposed-rock albedo factor (landscapeRockFactor).
     * @param {number} x @param {number} z @param {{height:number,slopeDegrees:number,footprint?:number,enabled?:boolean}} options terrain height (m) and geometric
     *   slope (degrees) at the position, the footprint (m per pixel, major axis of the 3D screen derivatives) and the uLandscapeResponse.w switch
     */
    terrainAppearanceSample(x, z, { height, slopeDegrees, footprint = 0, enabled = true }) {
        if (![x, z, height, slopeDegrees, footprint].every(Number.isFinite)) throw new Error('[Landscape] terrain appearance samples need a finite position, height, slope and footprint');
        const root = this.masks?.records.get(this.loaded.manifest.overviewId);
        if (!root || root.slot !== 0 || root.status !== 'resident') return null;
        const bounds = root.descriptor.bounds, spacing = (bounds.maxX - bounds.minX) / (this.masks.columns - 1), state = this.uniforms.uTerrainFieldsState.value;
        const source = (state[2] & 3) === 3 ? this.fields?.appearanceLayerSource() : null;
        const layer = source ? decodeLandscapeAppearanceLayer(landscapeAppearanceLayerUnits(source.pixels, source.offset, source.layout, bounds, x, z)) : null;
        const availability = layer ? landscapeTerrainFieldProgress(this.uniforms.uMaskMeta.value[0].w) * landscapeTerrainFreshness([state[0], state[1]], bounds, x, z) : 0;
        const inputs = landscapeTerrainAppearanceInputs({ layer, availability, height: height - this.loaded.manifest.coordinates.seaLevel, geometricSlopeDegrees: slopeDegrees,
            footprintSpacings: footprint / spacing, enabled });
        const soils = Object.fromEntries(this.appearance.materials.map(definition => { const share = landscapeSoilCatenaShare(definition.soilId); return [definition.soilId, { share, tone: share * inputs.tone, chroma: share * inputs.chroma }]; }));
        const rockFactor = enabled ? landscapeRockFactor({ slopeDegrees, height: height - this.loaded.manifest.coordinates.seaLevel, reach: inputs.reach, moisture: inputs.moisture * inputs.weight }) : [1, 1, 1];
        return { recipe: LANDSCAPE_TERRAIN_APPEARANCE.id, layerRecipe: LANDSCAPE_TERRAIN_APPEARANCE.layer.id, enabled, layer, availability, ...inputs, soils, rockFactor };
    }

    /**
     * landscape-dressing-inputs v1 of the displayed soil at a world position (the dressing diagnostics' inputs): the resident display coverage weights,
     * the nearest native planning cover and the fine terrain fields at the footprint. Planning-only cover keeps the v1 suppression; `inferredGround`
     * reports the outputs its inferred natural ground would have, so later dressing work can decide per use.
     * @param {number} x @param {number} z @param {{dx?:number[],dy?:number[]}} [options]
     */
    dressingSample(x, z, { dx = [0, 0], dy = [0, 0] } = {}) {
        const coverage = this.masks?.coverageSample(x, z, { dx, dy }), categorical = this.masks?.sample(x, z);
        if (!coverage || !categorical) return null;
        const sample = this.fields?.sample(x, z, { dx, dy }) ?? { availability: 0, fields: null };
        const soilWeights = Object.fromEntries(coverage.soilIds.map((soilId, index) => [soilId, coverage.weights[index]]));
        const planningShare = landscapePlanningCover(this.planningCoverMask, categorical.coverId) ? 1 : 0;
        const fields = sample.fields && sample.availability > 0 ? sample.fields : null;
        const outputs = sampleLandscapeDressingInputs({ soilWeights, planningShare, fields });
        const inferred = sampleLandscapeDressingInputs({ soilWeights, planningShare: 0, fields });
        return { ...outputs, planningShare, coverId: categorical.coverId, soilId: categorical.soilId, displaySoilId: categorical.displaySoilId, soilWeights, availability: sample.availability,
            fields, inferredGround: planningShare ? Object.fromEntries(Object.entries(inferred).filter(([key]) => key !== 'recipe' && key !== 'fieldsAvailable')) : null };
    }

    /** Generator-internal inspection through a detail worker. @param {number} x @param {number} z */
    detailSample(x, z) {
        if (!this.masks?.detail) throw new Error(`[Landscape] Generated surface detail is not active: ${this.detailReason ?? 'appearance not initialized'}`);
        return this.masks.detail.sample(x, z);
    }

    /** @param {boolean} enabled shared recipe warp of native and coarser coverage (generated pages keep their baked warp) */
    setSurfaceWarp(enabled) { setLandscapeSurfaceWarpUniforms(this.uniforms, this.warpUniforms, enabled); }

    /** @param {boolean} enabled mid-scale clump relief of material transitions (texture relief competition is unaffected) */
    setMaterialClumps(enabled) {
        if (!this.clumpUniforms) throw new Error('[Landscape] Material clump relief is configured once the appearance materials are initialized');
        setLandscapeMaterialClumpUniforms(this.uniforms, this.clumpUniforms, enabled);
    }

    /** @param {string} mode compile-time mode the view has applied to its terrain programs */
    setMaterialSampling(mode) { landscapeMaterialSamplingMode(mode); this.materialSampling = mode; }

    /** @param {boolean} enabled runtime stochastic tiling; disabled soils fall back to the single lattice sample without recompiling */
    setMaterialSamplingEnabled(enabled) {
        if (!this.samplingUniforms) throw new Error('[Landscape] Material sampling is configured once the appearance materials are initialized');
        setLandscapeMaterialSamplingUniforms(this.uniforms, this.samplingUniforms, enabled);
    }

    samplingSnapshot() {
        const model = LANDSCAPE_MATERIAL_SAMPLING, enabled = !!this.samplingUniforms && this.uniforms.uSoilStochastic.value.some(value => value !== 0);
        return { mode: this.materialSampling, define: landscapeMaterialSamplingMode(this.materialSampling), enabled, recipe: model.id, seed: this.seed,
            contrastFalloff: model.contrastFalloff, weightCutoff: model.weightCutoff, varianceExponent: model.varianceExponent, samplesPerLattice: model.samplesPerLattice, slopeLimit: model.slopeLimit,
            materials: (this.appearance?.materials ?? []).map(definition => ({ soilId: definition.soilId, materialId: definition.materialId, contrastSignal: definition.height ? 'relief' : 'luminance',
                topSalt: landscapeMaterialSamplingSalt(this.seed, definition.soilId), sideSalts: [landscapeMaterialSamplingSalt(this.seed, definition.soilId, 'side-x'), landscapeMaterialSamplingSalt(this.seed, definition.soilId, 'side-z')],
                ...landscapeMaterialSamplingDefinition(definition.soilId) })) };
    }

    clumpSnapshot() {
        return { enabled: this.uniforms.uClumpSettings.value[3] === 1, recipe: LANDSCAPE_MATERIAL_CLUMPS.id, seed: this.seed, gain: LANDSCAPE_MATERIAL_CLUMPS.gain,
            octaves: LANDSCAPE_MATERIAL_CLUMPS.octaves.map(octave => ({ frequency: octave.frequency, amplitude: octave.amplitude })), fadeWavelengths: [LANDSCAPE_MATERIAL_CLUMPS.fadeStartWavelengths, LANDSCAPE_MATERIAL_CLUMPS.fadeEndWavelengths],
            materials: (this.appearance?.materials ?? []).map(definition => ({ soilId: definition.soilId, enabled: !!definition.height && !!this.clumpUniforms, ...landscapeMaterialClumpDefinition(definition.soilId) })) };
    }

    coarsenForReload() {
        if (!this.initialized) return;
        for (const record of [...this.masks.records.values()]) if (record.id !== this.loaded.manifest.overviewId) this.masks.remove(record);
        this.masks.wanted = new Set([this.loaded.manifest.overviewId]);
        this.masks.detail?.reset();
        this.masks.updateUniforms();
        this.materials.transition = null;
        this.uniforms.uMaterialBlendIndex.value = -1;
        this.uniforms.uBlendBase.value = null;
        this.uniforms.uBlendSurface.value = null;
        for (const material of this.materials.materials) {
            if (material.current) this.materials.syncLeases(material.current, new Set());
            material.refs.clear();
            if (material.coarse) this.materials.bind(material, material.coarse);
        }
        for (const record of [...this.materials.records.values()]) if (record.resolution !== 32) this.materials.remove(record);
        this.budget.floor = { cpuBytes: 0, gpuBytes: 0 };
        this.budget.shared.update(this.budget.key, this.budget.credit(this.budget.totals()));
    }

    materialDemandSnapshot() {
        const demand = this.lastDemand;
        if (!demand) return null;
        return { recipe: LANDSCAPE_APPEARANCE_DEMAND.id, incumbentPreference: LANDSCAPE_APPEARANCE_DEMAND.incumbentPreference, provisional: demand.provisional,
            densityBySoil: { ...demand.densityBySoil }, desiredTiers: { ...demand.desiredTiers }, fittedTiers: { ...demand.fittedTiers }, limited: demand.limited.map(value => ({ ...value })),
            reason: demand.reason, transitionBytes: { ...demand.transitionBytes }, cpuBytes: demand.cpuBytes, gpuBytes: demand.gpuBytes };
    }

    detailSnapshot(masks) {
        if (masks?.detail) return { ...masks.detail, sizing: this.detailSizing ?? null };
        return { ...landscapeSurfaceDetailDisabledSnapshot({ levels: this.detailLevels, reason: this.detailReason ?? 'appearance-not-initialized', recipe: this.recipe, recipeHash: this.recipeHash, seed: this.seed }),
            sizing: this.detailSizing ?? null };
    }

    // natural display policy of planning-only cover: the shared source's status, per-native policy and reason, plus the planning samples of the
    // resident native pages counted by the policy that chose their display soil
    presentationSnapshot(masks) {
        const natural = this.natural.snapshot(), grid = this.loaded.manifest.grid, overviewSpacing = this.loaded.chunk.descriptor.sampleStride * grid.spacingX;
        return { ...natural, inferredSpacingMeters: natural.policy === LANDSCAPE_NATURAL_TERRAIN_INFERENCE ? grid.spacingX : overviewSpacing,
            fallback: { policy: LANDSCAPE_NATURAL_PRESENTATION, spacingMeters: overviewSpacing, sourceId: this.loaded.manifest.overviewId, sourceSha256: this.loaded.chunk.descriptor.channels.landCover.sha256 },
            samples: masks?.coverage?.naturalSamples ?? null, sourceCoverPreserved: true, semanticSoilPreserved: true };
    }

    snapshot() {
        const masks = this.masks?.snapshot(), materials = this.materials?.snapshot(), budget = this.budget?.snapshot(), detail = this.detailSnapshot(masks), fields = this.fields?.snapshot();
        const pending = (masks?.pending ?? 0) + (materials?.pending ?? 0) + detail.pending;
        const errors = [...this.errors, ...(masks?.errors ?? []), ...(materials?.errors ?? [])];
        const surfaceCache = this.surfaceCache?.snapshot() ?? LANDSCAPE_SURFACE_CACHE_OFF;
        return { ready: this.uniforms.uAppearanceReady.value === 1,
            settled: this.initialized ? pending === 0 && !masks?.transitioning && !masks?.missingWork && materials?.settled === true && !detail.missingWork && !detail.transitioning && (fields?.settled ?? true)
                && surfaceCache.settled : errors.length > 0,
            surfaceCache,
            desiredMaskIds: this.lastPlan?.desiredMaskIds ?? [], visibleMaskIds: this.lastPlan?.visibleMaskIds ?? [], residentMaskIds: masks?.residentMaskIds ?? [], maskLods: masks?.maskLods ?? [], maskCapacity: masks?.capacity ?? 0,
            materials: materials?.materials ?? [], desiredTier: this.lastPlan?.desiredTier ?? '32', desiredMaskPixels: this.lastPlan?.desiredMaskPixels ?? 0,
            cpuBytes: budget?.cpuBytes ?? 0, gpuBytes: budget?.gpuBytes ?? 0, reserved: budget?.reserved ?? { cpuBytes: 0, gpuBytes: 0 }, peakCpuBytes: budget?.peakCpuBytes ?? 0, peakGpuBytes: budget?.peakGpuBytes ?? 0,
            demandReservation: budget?.demand ?? null, materialDemand: this.materialDemandSnapshot(),
            pending, queueDepth: this.pool?.snapshot().queued ?? 0, canceled: this.pool?.snapshot().canceled ?? 0, loaded: (masks?.loaded ?? 0) + (materials?.loaded ?? 0), evicted: (masks?.evicted ?? 0) + (materials?.evicted ?? 0),
            uploadedBytesPerFrame: this.uploadedBytes, peakUploadedBytesPerFrame: this.peakUploadedBytes, frameCostMs: this.frameCostMs, errors,
            degradationReason: errors.length ? 'appearance-request-failed' : masks?.degradationReason ?? materials?.degradationReason ?? detail.degradationReason ?? null,
            revision: this.appearance?.revision ?? null, sourceRevision: this.loaded.manifest.revision, materialTransition: materials?.transition ?? null,
            presentation: this.presentationSnapshot(masks),
            coverage: masks?.coverage ?? null,
            coverageSlots: { ...this.coverageSlots },
            detail: { ...detail, workerPool: this.detailPool?.snapshot() ?? null },
            surfaceWarp: { enabled: this.uniforms.uSurfaceWarpEnabled.value === 1, recipe: this.recipe.id, seed: this.seed, wavelengths: [...this.recipe.warp.wavelengths],
                amplitudes: [...this.recipe.warp.amplitudes], maxDisplacementMeters: this.warpUniforms.maxDisplacementMeters, appliesTo: 'native-and-coarser-coverage; generated pages carry it baked' },
            materialBlend: materials?.blend ?? null,
            materialClumps: this.clumpSnapshot(),
            materialSampling: this.samplingSnapshot(),
            materialTiling: this.materials?.tiling ?? {},
            multiscale: this.multiscaleSnapshot(),
            surfaceLayers: this.surfaceLayerSnapshot(),
            materialUploads: materials?.uploads ?? null, pendingMaterialTier: materials?.pendingTier ?? null,
            terrainAppearance: { recipe: LANDSCAPE_TERRAIN_APPEARANCE.id, planningCover: Array.from(this.planningCoverMask), layer: this.fields?.appearanceLayer ?? null,
                roles: Object.fromEntries((this.appearance?.materials ?? []).map(definition => [definition.soilId, landscapeSoilTerrainRole(definition.soilId)])),
                switch: 'lighting.response.terrainAppearance (uLandscapeResponse.w)', model: LANDSCAPE_TERRAIN_APPEARANCE },
            terrainFields: fields ?? { status: this.terrainFieldsMode === 'off' ? 'disabled' : 'pending', reason: this.terrainFieldsMode === 'off' ? 'terrain-fields-off' : 'appearance-not-initialized', mode: this.terrainFieldsMode, url: this.fieldsUrl } };
    }

    releaseResources() {
        this.uniforms.uAppearanceReady.value = 0;
        this.surfaceCache = null;
        this.fields?.dispose();
        this.fields = null;
        this.materials?.dispose();
        this.masks?.dispose();
        this.pool?.dispose();
        this.detailPool?.dispose();
        this.materials = this.masks = this.pool = this.detailPool = null;
        for (const [name, uniform] of Object.entries(this.uniforms)) if (/^(uSoilBase|uSoilSurface|uBlendBase|uBlendSurface|uMaskPages|uTerrainFields$)/.test(name)) uniform.value = null;
        this.naturalHandle?.release();
        this.budget?.dispose();
        this.budget = null;
        this.initialized = false;
    }

    dispose() { this.disposed = true; this.abort.abort(); this.releaseResources(); this.surfaceCachePlaceholder.dispose(); }
}
