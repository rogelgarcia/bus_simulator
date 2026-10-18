// Owns the resolution-grouped material arrays of the terrain programs: their capacity, slot allocation, per-level uploads, the parameter texture and the transition uniform.
// @ts-check
// Design (AI 598 D3a, landscape-material-slots-v1). WebGL2 allows sixteen samplers per fragment stage and the uncached terrain program used all of
// them for six soils (a base and a surface sampler per soil plus the blend pair), so no material beyond the six could ever be drawn. Materials now
// live in three resolution-grouped sampler2DArrays: the coarse array holds every material's 128 px tier (one layer per material, the resident floor
// that replaces the former 32 px fallback), the mid (512 px) and fine (1024 px) arrays hold streamed slots that demand fits to materials near the
// camera. Each array is a base-colour array (SRGB8_ALPHA8) and a surface array (RGBA8, three layers per slot: normal, ORM, the paired micro layer
// or an unread neutral layer), allocated once with texStorage3D (the full mip chain, trilinear, repeat, anisotropy 4) and wrapped as ExternalTexture
// like the surface cache atlases. A slot is uploaded one map at a time with texSubImage3D per mip level from chains the appearance worker computes
// (LandscapeMaterialMips; generateMipmap on a 24-layer 1024 array would refilter every slot at every upload) inside the frame's upload allowance, and
// a material draws from a slot only once every level of every map is there (LandscapeMaterialPages). Per-material parameters live in the RGBA32F
// parameter texture (LandscapeMaterialParameters) whose residency row names the array and slot a material draws from and the arriving pair of its
// transition; the one transition at a time is described by uMaterialTransition (material, progress, from tier, from slot).
// Capacity: from the appearance GPU ceiling less the fixed consumers (the mask and fine coverage arrays, the coarse arrays, the parameter texture),
// bounded by the declared array ceiling, whole slots are taken in three phases: a few mid slots first (reservedMid fitted: the mid-distance materials
// every view holds, so a small profile never spends its whole room on one fine slot), then fine slots up to maxFine fitted, then mid slots up to maxMid
// fitted; every streamed array that holds a fitted slot keeps one spare slot beyond its fitted count, so a swap of two materials between arrays stays
// admissible (one coarsens into the spare while the other's slot is still held, as the former transition allowance did in bytes). A profile with no
// room for a streamed slot keeps the coarse floor alone with the explicit reason appearance-material-slots.
// Ledger: the arrays charge the coarse arrays and the parameter texture at allocation and every streamed slot's tier bytes (maps exact, by the
// pages owner) while a material holds it, so the shared ledger sees the materials' residency as it saw the per-tier textures before D3a. The
// geometry stream is budget-bound at the eye-height review poses (its tiles fill whatever the ledger leaves): charging the whole arrays at
// allocation took 48-96 MiB from it and changed the picture (AI 598 D3a room probe: NW-03 mean 1.6 sRGB bytes, NW-05 3.7), so the free slots'
// VRAM stays allocated but uncharged; the snapshot reports both the allocated and the charged bytes. A lost WebGL context drops every slot; a
// restored one recreates the arrays empty and the pages owner streams again from the floor.
import * as THREE from 'three';
import { LANDSCAPE_MATERIAL_PARAMETER_ROW, LANDSCAPE_MATERIAL_TIERS } from './LandscapeMaterialParameters.js';
import { landscapeMaterialMipOffsets } from './LandscapeMaterialMips.js';
import { LANDSCAPE_MATERIAL_SLOTS, LANDSCAPE_MATERIAL_TIER, landscapeMaterialParameterBytes, landscapeMaterialSlotBytes } from './LandscapeMaterialSlotCapacity.js';

export { LANDSCAPE_MATERIAL_SLOTS, LANDSCAPE_MATERIAL_TIER, landscapeMaterialParameterBytes, landscapeMaterialSlotBytes, landscapeMaterialSlotCapacity } from './LandscapeMaterialSlotCapacity.js';
const MODEL = LANDSCAPE_MATERIAL_SLOTS, TIER = LANDSCAPE_MATERIAL_TIER;

export class LandscapeMaterialSlots {
    /**
     * @param {{renderer:any,budget:any|null,uniforms:any,prefix:string,capacity:{fineSlots:number,midSlots:number,materialCapacity:number,fine?:number,mid?:number,bytes?:any,reason?:string|null},
     *   onRestore?:(() => void)|null}} options budget is the LandscapeAppearanceBudget the arrays are charged to (null charges nothing: probes); uniforms the shared appearance
     *   cells (uMaterialParameters with its table, uMaterialTransition, the six array samplers); capacity from landscapeMaterialSlotCapacity (fitted counts for the demand planner,
     *   physical counts for the arrays); onRestore is called after a restored WebGL context recreated the arrays empty; linearBaseColor stores the base colour
     *   arrays as RGBA8 instead of SRGB8_ALPHA8 (probes whose mirrors expect their linear bytes exactly; the production arrays decode sRGB)
     */
    constructor({ renderer, budget, uniforms, prefix, capacity, onRestore = null, linearBaseColor = false }) {
        if (!renderer?.getContext || !uniforms?.uMaterialParameters?.table || !uniforms.uMaterialTransition) throw new Error('[LandscapeMaterialSlots] A renderer and the appearance uniforms with their parameter table are required');
        for (const name of ['fineSlots', 'midSlots', 'materialCapacity']) if (!Number.isSafeInteger(capacity?.[name]) || capacity[name] < 0) throw new Error(`[LandscapeMaterialSlots] capacity.${name} must be a nonnegative integer`);
        if (capacity.materialCapacity < 1 || capacity.materialCapacity > uniforms.uMaterialParameters.table.capacity) throw new Error(`[LandscapeMaterialSlots] 1..${uniforms.uMaterialParameters.table.capacity} materials fit the parameter table`);
        Object.assign(this, { renderer, budget, uniforms, prefix, onRestore, linearBaseColor: linearBaseColor === true });
        this.table = uniforms.uMaterialParameters.table;
        this.capacity = { fine: capacity.fine ?? Math.max(0, capacity.fineSlots - MODEL.transitionSlots), mid: capacity.mid ?? Math.max(0, capacity.midSlots - MODEL.transitionSlots),
            fineSlots: capacity.fineSlots, midSlots: capacity.midSlots, materialCapacity: capacity.materialCapacity, reason: capacity.reason ?? null };
        /** @type {Array<{tier:number,resolution:number,slots:number,layout:ReturnType<typeof landscapeMaterialMipOffsets>,contents:Array<{material:number,maps:number}|null>}>} */
        this.tiers = [capacity.materialCapacity, capacity.midSlots, capacity.fineSlots].map((slots, tier) => ({ tier, resolution: MODEL.tiers[tier], slots, layout: landscapeMaterialMipOffsets(MODEL.tiers[tier]), contents: Array.from({ length: slots }, () => null) }));
        this.bytes = { coarse: landscapeMaterialSlotBytes(MODEL.tiers[0]) * capacity.materialCapacity, mid: landscapeMaterialSlotBytes(MODEL.tiers[1]) * capacity.midSlots, fine: landscapeMaterialSlotBytes(MODEL.tiers[2]) * capacity.fineSlots, parameters: landscapeMaterialParameterBytes() };
        this.bytes.allocated = this.bytes.coarse + this.bytes.mid + this.bytes.fine + this.bytes.parameters;
        // the standing charge: the coarse arrays and the parameter texture (streamed slots are charged by their holder while held)
        this.bytes.charged = this.bytes.coarse + this.bytes.parameters;
        this.uploads = { steps: 0, bytes: 0, levels: 0 };
        this.transition = null;
        this.disposed = false;
        this.lost = false;
        this.restores = 0;
        this.key = `${prefix}/material-arrays`;
        if (budget) {
            const admission = budget.reserve(this.key, { cpuBytes: this.table.data.byteLength, gpuBytes: this.bytes.charged, kind: MODEL.kind });
            if (!admission.admitted) throw new Error(`[LandscapeMaterialSlots] The coarse material arrays (${this.bytes.charged} bytes) were not admitted: ${admission.reason}`);
        }
        this.#create();
        this.onContextLost = () => { if (!this.disposed) this.lost = true; };
        this.onContextRestored = () => this.#restore();
        renderer.domElement?.addEventListener?.('webglcontextlost', this.onContextLost);
        renderer.domElement?.addEventListener?.('webglcontextrestored', this.onContextRestored);
    }

    // the six arrays: immutable storage with every mip level, trilinear, repeating, anisotropic; the base colour arrays decode sRGB
    #create() {
        const gl = this.renderer.getContext(), state = this.renderer.state, anisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
        const create = (internalFormat, size, layers) => {
            const texture = gl.createTexture(), levels = Math.log2(size) + 1;
            state.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
            gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internalFormat, size, size, Math.max(1, layers));
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
            if (anisotropic) gl.texParameterf(gl.TEXTURE_2D_ARRAY, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(MODEL.anisotropy, gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
            state.unbindTexture();
            return texture;
        };
        this.glTextures = this.tiers.map(tier => ({ base: create(this.linearBaseColor ? gl.RGBA8 : gl.SRGB8_ALPHA8, tier.resolution, tier.slots), surface: create(gl.RGBA8, tier.resolution, tier.slots * MODEL.surfaceLayers) }));
        this.textures = this.glTextures.map(pair => ({ base: new THREE.ExternalTexture(pair.base), surface: new THREE.ExternalTexture(pair.surface) }));
        this.anisotropySupported = !!anisotropic;
        this.#bind();
    }

    #bind() {
        const names = ['Coarse', 'Mid', 'Fine'];
        this.textures.forEach((pair, tier) => { this.uniforms[`uMaterialBase${names[tier]}`].value = pair.base; this.uniforms[`uMaterialSurface${names[tier]}`].value = pair.surface; });
    }

    #delete() {
        const gl = this.renderer.getContext();
        for (const pair of this.glTextures ?? []) { gl.deleteTexture(pair.base); gl.deleteTexture(pair.surface); }
        for (const pair of this.textures ?? []) { pair.base.dispose(); pair.surface.dispose(); }
        this.glTextures = null;
        this.textures = null;
    }

    // a restored context: new empty arrays, every slot forgotten, every residency row unbound; the owner streams again
    #restore() {
        if (this.disposed || !this.lost) return;
        this.#delete();
        for (const tier of this.tiers) tier.contents.fill(null);
        for (let material = 0; material < this.capacity.materialCapacity; material++) this.setResidency(material, -1, 0, -1, 0);
        this.setTransition(-1, 1, 0, 0);
        this.#create();
        this.lost = false;
        this.restores++;
        this.onRestore?.();
    }

    /** Whether the arrays can be drawn from (a lost context has none). */
    get available() { return !this.disposed && !this.lost; }

    /** The fitted capacities and the arrays' standing charge the demand planner fits materials to. */
    demandCapacity() { return { fine: this.capacity.fine, mid: this.capacity.mid, gpuBytes: this.bytes.charged }; }

    /** The slot of a material in the coarse array: its own index. @param {number} material */
    coarseSlot(material) { this.#materialInput(material); return material; }

    #materialInput(material) {
        if (!Number.isSafeInteger(material) || material < 0 || material >= this.capacity.materialCapacity) throw new Error(`[LandscapeMaterialSlots] Material ${material} is outside the ${this.capacity.materialCapacity} materials of the arrays`);
        return material;
    }

    #tierInput(tier) {
        if (!Number.isSafeInteger(tier) || tier < 0 || tier > 2) throw new Error(`[LandscapeMaterialSlots] Tier ${tier} is not coarse (0), mid (1) or fine (2)`);
        return this.tiers[tier];
    }

    /** Tier index of an array resolution, or -1 when no array holds that resolution. @param {number} resolution */
    tierOf(resolution) { return MODEL.tiers.indexOf(resolution); }

    /** Free slots of a streamed array. @param {number} tier 1 or 2 */
    freeSlots(tier) { const entry = this.#tierInput(tier); return entry.contents.reduce((count, content) => count + (content ? 0 : 1), 0); }

    /**
     * Takes a slot of a streamed array for a material (the coarse array needs no allocation: a material owns its own layer).
     * @param {number} tier 1 mid or 2 fine @param {number} material @returns {number} the slot, or -1 when the array is full
     */
    acquire(tier, material) {
        const entry = this.#tierInput(tier);
        this.#materialInput(material);
        if (tier === TIER.coarse) { entry.contents[material] = { material, maps: 0 }; return material; }
        const slot = entry.contents.findIndex(content => content === null);
        if (slot >= 0) entry.contents[slot] = { material, maps: 0 };
        return slot;
    }

    /** Frees a slot (its texels stay until the next upload). @param {number} tier @param {number} slot */
    release(tier, slot) {
        const entry = this.#tierInput(tier);
        if (!Number.isSafeInteger(slot) || slot < 0 || slot >= entry.slots) throw new Error(`[LandscapeMaterialSlots] Slot ${slot} is outside the ${entry.slots} slots of the ${MODEL.tierNames[tier]} array`);
        entry.contents[slot] = null;
    }

    /** The material a slot holds, or -1. @param {number} tier @param {number} slot */
    holder(tier, slot) { return this.#tierInput(tier).contents[slot]?.material ?? -1; }

    /**
     * Uploads one map of a slot from its complete mip chain: map 0 is the base colour (sRGB array), maps 1-3 the surface layers (normal, ORM, micro).
     * @param {number} tier @param {number} slot @param {number} map @param {Uint8Array} chain @returns {number} bytes uploaded (the mipped map)
     */
    upload(tier, slot, map, chain) {
        const entry = this.#tierInput(tier), content = entry.contents[slot];
        if (!this.available) throw new Error('[LandscapeMaterialSlots] The arrays are not available (context lost or disposed)');
        if (!content) throw new Error(`[LandscapeMaterialSlots] Slot ${slot} of the ${MODEL.tierNames[tier]} array holds no material`);
        if (!Number.isSafeInteger(map) || map < 0 || map >= MODEL.maps) throw new Error(`[LandscapeMaterialSlots] Map ${map} is not one of the ${MODEL.maps} maps of a slot`);
        if (!(chain instanceof Uint8Array) || chain.length !== entry.layout.bytes) throw new Error(`[LandscapeMaterialSlots] A ${entry.resolution} map chain holds ${entry.layout.bytes} bytes; received ${chain?.length}`);
        const gl = this.renderer.getContext(), state = this.renderer.state, texture = map === 0 ? this.glTextures[tier].base : this.glTextures[tier].surface;
        const layer = map === 0 ? slot : slot * MODEL.surfaceLayers + (map - 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        for (const name of ['UNPACK_ROW_LENGTH', 'UNPACK_IMAGE_HEIGHT', 'UNPACK_SKIP_PIXELS', 'UNPACK_SKIP_ROWS', 'UNPACK_SKIP_IMAGES']) gl.pixelStorei(gl[name], 0);
        state.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        for (let level = 0; level < entry.layout.sizes.length; level++) {
            const size = entry.layout.sizes[level], offset = entry.layout.offsets[level];
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, level, 0, 0, layer, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, chain.subarray(offset, offset + size * size * 4));
        }
        state.unbindTexture();
        content.maps++;
        this.uploads.steps++;
        this.uploads.levels += entry.layout.sizes.length;
        this.uploads.bytes += entry.layout.bytes;
        return entry.layout.bytes;
    }

    /** Points a material's residency row at the array and slot it draws from and the arriving pair of a transition (-1 for none). */
    setResidency(material, tier, slot, arrivingTier = -1, arrivingSlot = 0) {
        this.#materialInput(material);
        this.table.set(material, LANDSCAPE_MATERIAL_PARAMETER_ROW.residency, tier, slot, arrivingTier, arrivingSlot);
    }

    /** The one transition the shader mixes: material (-1 for none), progress, the array and slot it mixes from. */
    setTransition(material, progress, fromTier, fromSlot) {
        this.uniforms.uMaterialTransition.value.set(material, progress, fromTier, fromSlot);
        this.transition = material >= 0 ? { material, progress, fromTier, fromSlot } : null;
    }

    snapshot() {
        return { recipe: MODEL.id, available: this.available, lost: this.lost, restores: this.restores, capacity: { ...this.capacity }, bytes: { ...this.bytes }, anisotropySupported: this.anisotropySupported ?? null, linearBaseColor: this.linearBaseColor,
            tiers: this.tiers.map(tier => ({ name: MODEL.tierNames[tier.tier], resolution: tier.resolution, slots: tier.slots, used: tier.contents.filter(Boolean).length,
                materials: tier.contents.map(content => content ? content.material : -1) })),
            uploads: { ...this.uploads }, transition: this.transition ? { ...this.transition } : null, parameters: { rows: this.table.rows, capacity: this.table.capacity, version: this.table.version, hash: this.table.hash() } };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.renderer.domElement?.removeEventListener?.('webglcontextlost', this.onContextLost);
        this.renderer.domElement?.removeEventListener?.('webglcontextrestored', this.onContextRestored);
        for (const name of ['Coarse', 'Mid', 'Fine']) { this.uniforms[`uMaterialBase${name}`].value = null; this.uniforms[`uMaterialSurface${name}`].value = null; }
        if (!this.lost) this.#delete(); else { this.glTextures = null; this.textures = null; }
        this.budget?.release(this.key);
    }
}
