// Streams each material's tiers into the resolution-grouped material arrays, retains the coarse floor and hands demand its held tiers.
// @ts-check
// AI 598 D3a. Every material is resident at 128 px in the coarse array before the appearance is ready (the floor, where the 32 px fallback stood);
// the 32 px pages are still decoded, for the far-field palette alone (their mean colour is what the surround's soil palette and the authoritative
// tiles' far mips show). Finer tiers stream into slots of the mid (512) and fine (1024) arrays (LandscapeMaterialSlots): one request at a time,
// decoded with its complete mip chains by the appearance worker (LandscapeMaterialMips), uploaded one map at a time (the base colour, then each
// surface layer, each with its mips) while the frame's upload allowance fits it, so a 1024 tier with micro spans four frames under the shared
// 8 MiB cap; only a completely uploaded slot joins the 0.3 s transition the shader mixes between the old and the new array (uMaterialTransition),
// so a split upload never shows partial data. Coarsening to a tier above the floor loads that tier first and mixes to it directly. Every
// material streams toward its slot-fitted tier (LandscapeAppearanceDemand): materials above their fitted tier coarsen first and free slots, then
// materials below it upgrade, the closest first; a coarsening whose target array has no free slot waits for an upgrade to free one and falls to
// the floor only when nothing else can move (the planner's spare slot keeps that rare). A failed multiscale page disables that material's
// multiscale tiers explicitly and streaming resumes with its schema-1 pages; micro detail shows only while the bound and any arriving tier both
// carry the layer. Per-material parameters are rows of the shared parameter table (LandscapeMaterialParameters), written here exactly as the
// former uniform arrays were. The ledger charges a slot's tier bytes (maps exact) while a material holds it and a decode's bytes while it runs;
// the arrays themselves are charged by their owner.
import { resolvePbrMaterialPipeline } from '../../content3d/materials/PbrTexturePipeline.js';
import { getPbrTextureCalibrationResolver } from '../../content3d/materials/PbrTextureCalibrationResolver.js';
import { landscapeMaterialDecodeBytes, landscapeMaterialTierBytes, LANDSCAPE_APPEARANCE_DEMAND } from './LandscapeAppearanceDemand.js';
import { createLandscapeMaterialTiling, LANDSCAPE_MATERIAL_TILING } from './LandscapeMaterialTiling.js';
import { LANDSCAPE_MATERIAL_BLEND } from './LandscapeMaterialBlend.js';
import { landscapeMicroUniformValues } from './LandscapeMicroDetail.js';
import { landscapeMultiscaleFallback, landscapeSchemaMaterialTiers } from './LandscapeMultiscaleTiers.js';
import { landscapeAppearanceSoilPalette } from './LandscapeSoilPalette.js';
import { landscapeMaterialResponseValues } from './LandscapeMaterialResponse.js';
import { LANDSCAPE_MATERIAL_CALIBRATION, landscapeMaterialCalibration } from './LandscapeMaterialCalibration.js';
import { landscapeSoilTerrainRole } from './LandscapeTerrainAppearance.js';
import { LANDSCAPE_MATERIAL_PARAMETER_ROW, landscapeMaterialParameterRows, landscapeMaterialParameterTable, landscapeMaterialTierIndex, LANDSCAPE_MATERIAL_TIERS } from './LandscapeMaterialParameters.js';

const ROW = LANDSCAPE_MATERIAL_PARAMETER_ROW, FLOOR = LANDSCAPE_APPEARANCE_DEMAND.floorResolution, PALETTE = 32;

export class LandscapeMaterialPages {
    /**
     * @param {{appearance:any,multiscale?:any,budget?:any,pool?:any,uniforms:any,prefix:string,slots?:any}} options multiscale is the resolveLandscapeMultiscaleTiers
     *   result; without it every material keeps its schema-1 tiers; slots is the LandscapeMaterialSlots the tiers upload into (a parameter-only owner, as the
     *   material audits build, streams nothing)
     */
    constructor({ appearance, multiscale = landscapeMultiscaleFallback(appearance, 'absent', 'multiscale-not-requested'), budget = null, pool = null, uniforms, prefix, slots = null }) {
        Object.assign(this, { appearance, multiscale, budget, pool, uniforms, prefix, slots });
        this.table = landscapeMaterialParameterTable(uniforms);
        if (appearance.materials.length > this.table.capacity) throw new Error(`[Landscape] ${appearance.materials.length} materials exceed the parameter table's ${this.table.capacity} rows`);
        this.materials = appearance.materials.map((definition, index) => {
            const resolved = multiscale.materials[index];
            if (resolved?.soilId !== definition.soilId) throw new Error(`[Landscape] Multiscale tiers do not follow appearance soil ${definition.soilId}`);
            return { definition, index, floor: null, current: null, palette: null, desiredResolution: FLOOR, fittedResolution: FLOOR, priority: 0, refs: new Set(), tiers: resolved.tiers, maps: resolved.maps,
                micro: resolved.micro, multiscaleFailure: null };
        });
        this.limitation = null;
        this.records = new Map();
        this.failures = new Map();
        this.multiscaleFailures = [];
        this.loaded = 0;
        this.evicted = 0;
        this.disposed = false;
        this.tiling = {};
        this.microEnabled = true;
        this.calibrationSwitches = { albedo: true, normalLean: true };
        this.uploads = { maps: 0, bytes: 0, tiers: 0, splitTiers: 0, maxFramesPerTier: 0, lastTier: null };
        // AI 596 D5: the far-field palette (soilPalette) changes with each palette page decoded and each calibration; its version lets a consumer skip unchanged palettes
        this.paletteVersion = 0;
        this.palette = null;
        this.transition = null;
        this.pending = null;
        if (slots) slots.onRestore = () => this.restore();
    }

    /**
     * AI 596 D5: the palette the render-only surround draws with: each soil's mean linear albedo of its 32 px base-colour page under its albedo correction
     * (brightness with the landscape-local calibration gain, hue, saturation, tint) and the mean roughness and occlusion of its 32 px ORM page, ready once
     * every material has its palette page. Versioned by palette arrivals and calibration; the same object is returned until it changes.
     * @returns {{version:number,ready:boolean,soils:Record<string, number[]>,surface:Record<string, number[]>}}
     */
    soilPalette() {
        if (this.palette?.version !== this.paletteVersion) {
            const rows = row => this.materials.map(material => this.table.row(material.index, row));
            this.palette = Object.freeze({ version: this.paletteVersion, ...landscapeAppearanceSoilPalette(this.materials, { albedo: rows(ROW.albedo), roughness: rows(ROW.roughness), range: rows(ROW.range), scale: rows(ROW.scale) }) });
        }
        return this.palette;
    }

    async initialize() {
        const resolver = getPbrTextureCalibrationResolver();
        await resolver.preloadOverrides(this.materials.map(value => value.definition.materialId));
        if (this.disposed) return;
        this.response = landscapeMaterialResponseValues(this.materials.map(material => ({ soilId: material.definition.soilId })));
        for (const material of this.materials) {
            const { definition } = material;
            material.pipeline = resolvePbrMaterialPipeline(definition.materialId, { calibrationOverrides: resolver.getCachedOverrides(definition.materialId), calibrationResolver: resolver });
            this.tiling[definition.soilId] = createLandscapeMaterialTiling(material.pipeline.overrides.effective.tileMeters, { microTileMeters: material.micro?.tileMeters ?? null });
            material.calibration = landscapeMaterialCalibration(definition.materialId, this.calibrationSwitches);
            this.writeRows(material);
        }
        this.uniforms.uSurfaceBlendEnabled.value = this.materials.some(material => !!material.definition.height) ? 1 : 0;
        this.initialized = true;
    }

    // the former uSoilScale/Tiling/Albedo/Roughness/Range/State/Response values of a material, written with the pre-D3a arithmetic (landscapeMaterialParameterRows)
    writeRows(material) {
        const { definition, index } = material, effective = material.pipeline.overrides.effective, arriving = this.transition?.material === material ? this.transition.target : null;
        const active = this.microEnabled && !!material.micro && !!material.current?.micro && (!arriving || arriving.micro);
        const rows = landscapeMaterialParameterRows({ terrainRole: landscapeSoilTerrainRole(definition.soilId), effective, albedoGain: material.calibration.albedoGain, roughnessInputRange: definition.roughnessInputRange,
            uvRotationDegrees: material.pipeline.meta?.calibration?.uvRotationDegrees ?? 0, relief: !!definition.height, resolution: material.current?.resolution ?? FLOOR,
            tileMeters: this.tiling[definition.soilId]?.tileMeters ?? definition.tileMeters, micro: active ? landscapeMicroUniformValues(definition.soilId, material.micro) : null,
            response: { diffuseRoughness: this.response.response[index * 4], specularShadowing: this.response.response[index * 4 + 1], opposition: this.response.opposition[index] }, meanNormalSlope: material.calibration.meanNormalSlope });
        for (const [id, values] of Object.entries(rows)) this.table.setRow(index, ROW[id], values);
    }

    // AI577 D5c: natural-ground response per material and the landscape-local material calibration (albedo gain on the shared brightness, page mean normal slope)
    applyCalibration() {
        for (const material of this.materials) { material.calibration = landscapeMaterialCalibration(material.definition.materialId, this.calibrationSwitches); this.writeRows(material); }
        this.paletteVersion++;
    }

    /** @param {{albedo?:boolean,normalLean?:boolean}} switches landscape-local calibration parts for A/B evidence; omitted keys keep their state */
    setCalibration(switches) {
        if (!switches || typeof switches !== 'object' || !Object.entries(switches).every(([key, value]) => ['albedo', 'normalLean'].includes(key) && typeof value === 'boolean')) {
            throw new Error('[Landscape] Material calibration accepts boolean albedo and normalLean');
        }
        this.calibrationSwitches = { ...this.calibrationSwitches, ...switches };
        if (this.initialized) this.applyCalibration();
    }

    /** Tier resolutions each soil can stream now, for the view planner and demand. */
    materialTiers() { return Object.fromEntries(this.materials.map(material => [material.definition.soilId, material.tiers.map(tier => tier.resolution)])); }

    /** Tiers a material can still request: its resolved tiers less those whose bounded retries are exhausted. @param {any} material */
    streamableResolutions(material) {
        return material.tiers.map(tier => tier.resolution).filter(resolution => (this.failures.get(`${material.index}/${resolution}`)?.attempts ?? 0) < 2);
    }

    /** Tier a material holds or is acquiring: its bound tier, an arriving transition target or its pending request. @param {any} material */
    heldResolution(material) {
        return Math.max(material.current?.resolution ?? 0, this.transition?.material === material ? this.transition.target.resolution : 0, this.pending?.material === material ? this.pending.resolution : 0);
    }

    // micro detail shows only while the bound tier and any arriving tier of the material both carry the paired layer (the tiling and relief rows follow)
    applyMicroUniforms() { if (this.initialized) for (const material of this.materials) this.writeRows(material); }

    /** @param {boolean} enabled paired micro detail of every material that has it */
    setMicroEnabled(enabled) {
        if (typeof enabled !== 'boolean') throw new Error('[Landscape] Micro detail enablement must be boolean');
        this.microEnabled = enabled;
        this.applyMicroUniforms();
    }

    /**
     * @param {Map<number,Set<string>>} interests visible mask IDs referencing each material index @param {Object<string,string>} desiredTiers each material's own texel demand
     * @param {{fittedTiers?:Object<string,string>,priorities?:Object<string,number>,limitation?:string|null}} [composition] the slot-fitted tiers that cap streaming, the
     *   densities ordering upgrades and the shortage that kept a fitted tier below its demand; isolated callers without a composition stream the desired tiers directly
     */
    interest(interests, desiredTiers, { fittedTiers = desiredTiers, priorities = {}, limitation = null } = {}) {
        for (const material of this.materials) {
            const soilId = material.definition.soilId;
            material.refs = interests.get(material.index) ?? new Set();
            material.desiredResolution = Math.max(FLOOR, material.refs.size ? Number(desiredTiers[soilId] ?? FLOOR) : FLOOR);
            material.fittedResolution = Math.max(FLOOR, Math.min(material.desiredResolution, Number(fittedTiers[soilId] ?? FLOOR)));
            material.priority = material.refs.size ? priorities[soilId] ?? 0 : 0;
            if (material.current) this.syncLeases(material.current, material.refs);
        }
        this.limitation = limitation;
        const pending = this.pending, current = pending?.material.current;
        if (pending?.kind === 'slot' && (pending.resolution > pending.material.fittedResolution
            || current && pending.resolution < current.resolution && pending.material.fittedResolution >= current.resolution)) this.remove(pending);
    }

    syncLeases(record, refs) {
        if (!this.budget) return;
        for (const [id, lease] of record.leases) if (!refs.has(id)) { lease.release(); record.leases.delete(id); }
        for (const id of refs) if (!record.leases.has(id)) record.leases.set(id, this.budget.shared.acquireLease(record.key, { consumer: `appearance/${id}`, priority: 30, accuracy: 'approximate' }));
    }

    // a request: the 32 px palette page (decode only), the 128 px floor (its own coarse layer) or a finer tier into a free slot of its array
    request(material, resolution) {
        const tier = material.tiers.find(value => value.resolution === resolution);
        if (!tier || !this.slots || !this.pool || !this.budget) return false;
        const id = `${material.index}/${resolution}`;
        const failure = this.failures.get(id);
        if (failure && (failure.attempts >= 2 || performance.now() < failure.retryAt)) return false;
        const kind = resolution === PALETTE ? 'palette' : resolution === FLOOR ? 'floor' : 'slot', maps = tier.pages.length;
        const arrayTier = kind === 'palette' ? -1 : landscapeMaterialTierIndex(resolution), slot = kind === 'slot' ? this.slots.acquire(arrayTier, material.index) : kind === 'floor' ? this.slots.acquire(0, material.index) : -1;
        if (kind === 'slot' && slot < 0) { this.degradationReason = 'appearance-material-slots'; return false; }
        const { gpuBytes } = landscapeMaterialTierBytes(resolution, maps), decodeBytes = landscapeMaterialDecodeBytes(resolution, maps);
        const key = `${this.prefix}/material/${material.definition.soilId}/${material.definition.materialId}/${resolution}/${tier.pages.map(value => value.page.sha256).join('/')}`;
        const admission = this.budget.reserve(key, { cpuBytes: decodeBytes, gpuBytes: kind === 'slot' ? gpuBytes : 0, kind: 'appearance-material-decode' });
        if (!admission.admitted) { if (kind === 'slot') this.slots.release(arrayTier, slot); this.degradationReason = admission.reason; return false; }
        const record = { id, key, material, resolution, kind, tier: arrayTier, slot, maps, micro: tier.pages.some(value => value.role === 'micro'), multiscale: tier.pages.some(value => value.source === 'multiscale'),
            bytes: kind === 'slot' ? gpuBytes : 0, status: 'loading', uploadedMaps: 0, uploadFrames: 0, abort: new AbortController(), leases: new Map(), chains: null };
        this.records.set(id, record);
        this.pending = record;
        this.pool.request({ type: 'material', resolution, pages: tier.pages }, { priority: kind === 'slot' ? 20 : 90, signal: record.abort.signal }).then(result => {
            if (this.disposed || record.abort.signal.aborted || this.records.get(id) !== record) return;
            record.chains = result.maps;
            record.status = 'decoded';
            this.budget.update(key, { cpuBytes: result.maps.reduce((sum, chain) => sum + chain.byteLength, 0), kind: 'appearance-material-upload-pending' });
            this.loaded++;
        }).catch(error => {
            if (error.name === 'AbortError' || this.disposed) return;
            if (record.multiscale) this.disableMultiscale(material, error.message);
            else this.failures.set(id, { materialId: material.definition.materialId, resolution, message: error.message, attempts: (failure?.attempts ?? 0) + 1, retryAt: performance.now() + 2500 });
            this.remove(record);
        });
        return true;
    }

    // a failed companion page returns the material to its schema-1 tiers; resident records stay valid and keep serving until replaced
    disableMultiscale(material, message) {
        if (material.multiscaleFailure) return;
        material.multiscaleFailure = message;
        material.tiers = landscapeSchemaMaterialTiers(material.definition);
        material.maps = 3;
        material.micro = null;
        for (const id of [...this.failures.keys()]) if (id.startsWith(`${material.index}/`)) this.failures.delete(id);
        this.multiscaleFailures.push({ soilId: material.definition.soilId, materialId: material.definition.materialId, message });
        this.applyMicroUniforms();
    }

    // the palette page: its level-0 base colour and surface layers feed the far-field palette; nothing is uploaded
    completePalette(record) {
        const material = record.material, texels = record.resolution ** 2 * 4;
        material.palette = { baseColor: record.chains[0].slice(0, texels), surface: new Uint8Array(texels * (record.maps - 1)), tier: material.tiers.find(tier => tier.resolution === record.resolution), maps: record.maps };
        for (let layer = 1; layer < record.maps; layer++) material.palette.surface.set(record.chains[layer].subarray(0, texels), (layer - 1) * texels);
        this.paletteVersion++;
        this.remove(record);
    }

    bind(material, record) {
        this.slots.setResidency(material.index, record.tier, record.slot, -1, 0);
        material.current = record;
        this.syncLeases(record, material.refs);
        this.applyMicroUniforms();
    }

    beginTransition(material, target) {
        const from = material.current;
        this.transition = { material, from, target, progress: 0 };
        this.slots.setResidency(material.index, from.tier, from.slot, target.tier, target.slot);
        this.slots.setTransition(material.index, 0, from.tier, from.slot);
        this.applyMicroUniforms();
    }

    update(dt, uploadAllowance) {
        if (!this.initialized || this.disposed) return 0;
        if (!this.slots) throw new Error('[Landscape] A parameter-only material owner streams nothing');
        this.idle = false;
        this.degradationReason = null;
        if (this.transition) {
            const transition = this.transition;
            transition.progress = Math.min(1, transition.progress + Math.min(dt, .1) / .3);
            this.slots.setTransition(transition.material.index, transition.progress, transition.from.tier, transition.from.slot);
            if (transition.progress === 1) {
                this.syncLeases(transition.from, new Set());
                this.transition = null;
                this.bind(transition.material, transition.target);
                this.slots.setTransition(-1, 1, 0, 0);
                if (transition.from.kind === 'slot') this.remove(transition.from);
            }
            return 0;
        }
        if (this.pending) {
            const record = this.pending;
            if (record.status !== 'decoded' && record.status !== 'uploading') return 0;
            if (record.kind === 'palette') { this.pending = null; this.completePalette(record); return 0; }
            const mapBytes = this.slots.tiers[record.tier].layout.bytes;
            let uploaded = 0;
            while (record.uploadedMaps < record.maps && uploaded + mapBytes <= uploadAllowance) { uploaded += this.slots.upload(record.tier, record.slot, record.uploadedMaps, record.chains[record.uploadedMaps]); record.uploadedMaps++; }
            if (uploaded) { record.uploadFrames++; this.uploads.maps += uploaded / mapBytes; this.uploads.bytes += uploaded; }
            if (record.uploadedMaps < record.maps) {
                if (uploaded && record.status !== 'uploading') { record.status = 'uploading'; this.budget.update(record.key, { kind: 'appearance-material-uploading' }); }
                return uploaded;
            }
            record.status = 'resident';
            record.chains = null;
            this.budget.update(record.key, { cpuBytes: 0, kind: 'appearance-material-resident' });
            this.pending = null;
            this.uploads.tiers++;
            if (record.uploadFrames > 1) this.uploads.splitTiers++;
            this.uploads.maxFramesPerTier = Math.max(this.uploads.maxFramesPerTier, record.uploadFrames);
            this.uploads.lastTier = { soilId: record.material.definition.soilId, resolution: record.resolution, maps: record.maps, frames: record.uploadFrames, bytes: record.maps * mapBytes, tier: record.tier, slot: record.slot };
            if (record.kind === 'floor' && !record.material.floor) { record.material.floor = record; this.bind(record.material, record); }
            else this.beginTransition(record.material, record);
            return uploaded;
        }
        const retryable = resolution => material => !(this.failures.get(`${material.index}/${resolution}`)?.attempts >= 2), due = resolution => material => performance.now() >= (this.failures.get(`${material.index}/${resolution}`)?.retryAt ?? 0);
        const missingFloors = this.materials.filter(material => !material.floor && retryable(FLOOR)(material)), floor = missingFloors.find(due(FLOOR));
        if (floor) { this.idle = !this.request(floor, FLOOR); return 0; }
        if (!this.ready) { this.idle = missingFloors.length === 0; return 0; }
        const missingPalettes = this.materials.filter(material => !material.palette && material.tiers.some(tier => tier.resolution === PALETTE) && retryable(PALETTE)(material)), palette = missingPalettes.find(due(PALETTE));
        if (palette) { this.idle = !this.request(palette, PALETTE); return 0; }
        // coarsening frees slots first; a coarsening whose target array is full waits for an upgrade to free one, and falls to the floor only when nothing moves
        const down = this.materials.find(material => material.current.resolution > material.fittedResolution);
        if (down) {
            const target = down.tiers.filter(tier => tier.resolution > FLOOR && tier.resolution <= down.fittedResolution).at(-1);
            if (!target) { this.beginTransition(down, down.floor); return 0; }
            if (this.request(down, target.resolution)) return 0;
        }
        const up = this.materials.filter(material => material.current.resolution < material.fittedResolution).sort((a, b) => b.priority - a.priority || b.refs.size - a.refs.size || a.index - b.index);
        for (const material of up) {
            const tiers = material.tiers.filter(tier => tier.resolution > material.current.resolution && tier.resolution <= material.fittedResolution).reverse();
            for (const tier of tiers) if (this.request(material, tier.resolution)) return 0;
        }
        if (down) { this.beginTransition(down, down.floor); return 0; }
        this.idle = true;
        return 0;
    }

    get ready() { return this.materials.every(material => !!material.floor); }

    remove(record) {
        if (this.records.get(record.id) !== record) return;
        record.abort.abort();
        this.syncLeases(record, new Set());
        if (!this.disposed && record.material.current === record && record.material.floor && record !== record.material.floor) this.bind(record.material, record.material.floor);
        if (record.kind === 'slot' && this.slots) this.slots.release(record.tier, record.slot);
        record.chains = null;
        this.records.delete(record.id);
        this.budget?.release(record.key);
        if (this.pending === record) this.pending = null;
        this.evicted++;
    }

    /** Returns every material to its floor and frees every slot (a reload: the records' identities belong to the previous load). */
    coarsen() {
        this.transition = null;
        this.slots?.setTransition(-1, 1, 0, 0);
        for (const material of this.materials) {
            if (material.current) this.syncLeases(material.current, new Set());
            material.refs.clear();
            if (material.floor) this.bind(material, material.floor);
        }
        for (const record of [...this.records.values()]) if (record.kind !== 'floor') this.remove(record);
    }

    // a restored WebGL context recreated the arrays empty: every record is gone, the floors stream again (palettes are CPU data and stay)
    restore() {
        this.transition = null;
        this.pending = null;
        for (const record of [...this.records.values()]) { record.abort.abort(); this.syncLeases(record, new Set()); this.records.delete(record.id); this.budget?.release(record.key); }
        for (const material of this.materials) { material.floor = material.current = null; }
    }

    snapshot() {
        const pending = this.pending, row = (material, name) => this.table.row(material.index, ROW[name]);
        return { ready: this.ready, settled: this.idle === true && !this.pending && !this.transition, pending: pending ? 1 : 0, floorResolution: FLOOR, paletteResolution: PALETTE,
            pendingTier: pending ? { soilId: pending.material.definition.soilId, resolution: pending.resolution, status: pending.status, maps: pending.maps, uploadedMaps: pending.uploadedMaps, micro: pending.micro, kind: pending.kind } : null,
            transition: this.transition ? { materialId: this.transition.material.definition.materialId, from: this.transition.from.resolution, to: this.transition.target.resolution, progress: this.transition.progress } : null,
            blend: { enabled: this.uniforms.uSurfaceBlendEnabled.value === 1, recipe: LANDSCAPE_MATERIAL_BLEND },
            materials: this.materials.map(material => ({ materialId: material.definition.materialId, soilId: material.definition.soilId, index: material.index, resolution: material.current?.resolution ?? 0, desiredResolution: material.desiredResolution,
                fittedResolution: material.fittedResolution, density: material.priority, tier: material.current ? LANDSCAPE_MATERIAL_TIERS[material.current.tier] : null, slot: material.current?.slot ?? null, palette: !!material.palette,
                refCount: material.refs.size, tileMeters: material.pipeline?.overrides.effective.tileMeters ?? material.definition.tileMeters, calibration: material.pipeline?.diagnostics ?? null, height: material.definition.height ?? null,
                tiers: material.tiers.map(tier => tier.resolution), maps: material.current?.maps ?? material.maps, micro: material.micro ? { ...material.micro, resident: !!material.current?.micro, shown: row(material, 'tiling')[1] > 0 } : null,
                multiscaleFailure: material.multiscaleFailure,
                response: this.response ? { diffuseRoughness: this.response.response[material.index * 4], specularShadowing: this.response.response[material.index * 4 + 1], opposition: this.response.opposition[material.index] } : null,
                landscapeCalibration: material.calibration ? { ...material.calibration, albedoBrightness: row(material, 'albedo')[0] } : null })),
            micro: { enabled: this.microEnabled }, calibration: { id: LANDSCAPE_MATERIAL_CALIBRATION.id, switches: { ...this.calibrationSwitches } },
            uploads: { ...this.uploads, lastTier: this.uploads.lastTier ? { ...this.uploads.lastTier } : null }, multiscaleFailures: [...this.multiscaleFailures], slots: this.slots?.snapshot() ?? null,
            tiling: LANDSCAPE_MATERIAL_TILING.id, errors: [...this.failures.values()], loaded: this.loaded, evicted: this.evicted, degradationReason: this.degradationReason ?? this.limitation };
    }

    dispose() {
        this.disposed = true;
        for (const record of [...this.records.values()]) this.remove(record);
        this.transition = null;
        this.pending = null;
        for (const material of this.materials) { material.current = material.floor = null; material.refs.clear(); }
        this.paletteVersion++;
    }
}
