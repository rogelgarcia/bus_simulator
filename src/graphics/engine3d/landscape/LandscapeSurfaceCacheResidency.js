// Keeps surface cache pages in a fixed slot atlas with least-recently-desired eviction and resolves the per-mip indirection windows.
// @ts-check
// AI577 D6 (landscape-surface-cache-v1). A slot holds one page; publishing a regenerated page moves it to a new slot and frees the old one only
// then, so a stale page keeps rendering until its replacement exists. Eviction takes the page desired longest ago, never the pinned root or a
// page desired in the protected frame. The indirection keeps one RGBA8UI 64x64 layer per mip: every texel of a mip's toroidal window holds the
// slot and mip of the page itself when it is resident, otherwise its parent's texel, which the next coarser window always contains, so one fetch
// returns the best resident ancestor. Changed pages mark the region they cover in their own and every finer layer; a window that moves marks only
// the strips of pages entering it (the toroidal addressing keeps every other texel valid); layers rebuild their dirty boxes coarse to fine.
import { LANDSCAPE_SURFACE_CACHE, landscapeSurfaceCachePageKey, landscapeSurfaceCachePagesPerAxis, landscapeSurfaceCacheWindowOrigin,
    parseLandscapeSurfaceCachePageKey } from './LandscapeSurfaceCacheLayout.js';

const WINDOW = LANDSCAPE_SURFACE_CACHE.windowPages;

export class LandscapeSurfaceCacheResidency {
    /** @param {{slots:number}} options */
    constructor({ slots }) {
        if (!Number.isSafeInteger(slots) || slots < 1) throw new Error('[LandscapeSurfaceCache] residency needs a positive slot count');
        this.slots = slots;
        this.slotKeys = new Float64Array(slots).fill(-1);
        this.free = Array.from({ length: slots }, (_, index) => slots - 1 - index);
        /** @type {Map<number, {key:number,mip:number,x:number,z:number,slot:number,identity:string,lastDesired:number,generatedFrame:number,pinned:boolean,stale:boolean}>} */
        this.pages = new Map();
        this.evictions = 0;
    }

    get freeSlots() { return this.free.length; }

    /** @param {number} key */
    get(key) { return this.pages.get(key) ?? null; }

    /** @param {number} mip @param {number} x @param {number} z @returns {number} the resident slot or -1 */
    slotOf(mip, x, z) { return this.pages.get(landscapeSurfaceCachePageKey(mip, x, z))?.slot ?? -1; }

    /** @param {number} key @param {number} frame */
    touch(key, frame) { const record = this.pages.get(key); if (record) record.lastDesired = frame; return !!record; }

    /**
     * A free slot, or the slot of the evictable page desired longest ago (finer first on ties); pages desired at or after protectFrame and pinned
     * pages are never evicted. @param {number} protectFrame @returns {{slot:number,evicted:{key:number,mip:number,x:number,z:number}|null}}
     */
    allocate(protectFrame) {
        if (this.free.length) return { slot: /** @type {number} */ (this.free.pop()), evicted: null };
        let victim = null;
        for (const record of this.pages.values()) {
            if (record.pinned || record.lastDesired >= protectFrame) continue;
            if (!victim || record.lastDesired < victim.lastDesired || (record.lastDesired === victim.lastDesired && record.mip < victim.mip)) victim = record;
        }
        if (!victim) return { slot: -1, evicted: null };
        const evicted = { key: victim.key, mip: victim.mip, x: victim.x, z: victim.z };
        this.evict(victim.key);
        return { slot: /** @type {number} */ (this.free.pop()), evicted };
    }

    /** Returns an allocated slot that was not published. @param {number} slot */
    release(slot) {
        if (this.slotKeys[slot] !== -1) throw new Error(`[LandscapeSurfaceCache] slot ${slot} still holds page ${this.slotKeys[slot]}`);
        this.free.push(slot);
    }

    /**
     * Publishes a generated page in its slot; a previous version of the page frees its slot now. @param {{key:number,slot:number,identity:string,frame:number,pinned?:boolean}} page
     * @returns {{previousSlot:number}}
     */
    publish({ key, slot, identity, frame, pinned = false }) {
        if (this.slotKeys[slot] !== -1) throw new Error(`[LandscapeSurfaceCache] slot ${slot} is occupied by page ${this.slotKeys[slot]}`);
        const previous = this.pages.get(key);
        if (previous) { this.slotKeys[previous.slot] = -1; this.free.push(previous.slot); }
        const { mip, x, z } = parseLandscapeSurfaceCachePageKey(key);
        this.pages.set(key, { key, mip, x, z, slot, identity, lastDesired: frame, generatedFrame: frame, pinned: pinned || !!previous?.pinned, stale: false });
        this.slotKeys[slot] = key;
        return { previousSlot: previous ? previous.slot : -1 };
    }

    /** @param {number} key */
    evict(key) {
        const record = this.pages.get(key);
        if (!record) return false;
        this.pages.delete(key);
        this.slotKeys[record.slot] = -1;
        this.free.push(record.slot);
        this.evictions++;
        return true;
    }

    clear() {
        this.pages.clear();
        this.slotKeys.fill(-1);
        this.free = Array.from({ length: this.slots }, (_, index) => this.slots - 1 - index);
    }
}

export class LandscapeSurfaceCacheIndirection {
    /** @param {{geometry:any}} options */
    constructor({ geometry }) {
        this.geometry = geometry;
        this.data = new Uint8Array(WINDOW * WINDOW * 4 * geometry.mips);
        this.layerBytes = WINDOW * WINDOW * 4;
        this.center = null;
        /** @type {Array<{x:number,z:number}|null>} */
        this.origins = Array.from({ length: geometry.mips }, () => null);
        /** @type {Array<Array<{x0:number,z0:number,x1:number,z1:number}>>} dirty page boxes per layer (absolute page coordinates) */
        this.dirty = Array.from({ length: geometry.mips }, () => []);
        this.rebuilds = 0;
        this.rebuiltEntries = 0;
    }

    /** Forgets every window and entry (a new binding or a restored context); the next center places every window afresh. */
    reset() {
        this.data.fill(0);
        this.center = null;
        this.origins.fill(null);
        for (const list of this.dirty) list.length = 0;
    }

    // a box clipped to the layer's window joins its dirty list; a list grown past a few boxes collapses into their bounding box
    #markBox(mip, x0, z0, x1, z1) {
        const origin = this.origins[mip];
        if (!origin) return;
        const pages = landscapeSurfaceCachePagesPerAxis(this.geometry, mip);
        const box = { x0: Math.max(x0, origin.x), z0: Math.max(z0, origin.z), x1: Math.min(x1, origin.x + WINDOW, pages), z1: Math.min(z1, origin.z + WINDOW, pages) };
        if (box.x0 >= box.x1 || box.z0 >= box.z1) return;
        const list = this.dirty[mip];
        list.push(box);
        if (list.length > 8) {
            const merged = list.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1) }));
            list.length = 0;
            list.push(merged);
        }
    }

    /**
     * Moves every window to a center (virtual meters). A window that shifted by less than its size marks the strips of pages that entered it; a
     * larger jump (or a first placement) marks the whole window. @param {{x:number,z:number}} center
     */
    setCenter(center) {
        this.center = center;
        for (let mip = 0; mip < this.geometry.mips; mip++) {
            const origin = landscapeSurfaceCacheWindowOrigin(this.geometry, mip, center), previous = this.origins[mip];
            if (previous && previous.x === origin.x && previous.z === origin.z) continue;
            this.origins[mip] = origin;
            if (!previous || Math.abs(origin.x - previous.x) >= WINDOW || Math.abs(origin.z - previous.z) >= WINDOW) {
                this.#markBox(mip, origin.x, origin.z, origin.x + WINDOW, origin.z + WINDOW);
                continue;
            }
            // columns that entered along x (over the new window's rows), then rows that entered along z
            if (origin.x > previous.x) this.#markBox(mip, previous.x + WINDOW, origin.z, origin.x + WINDOW, origin.z + WINDOW);
            else if (origin.x < previous.x) this.#markBox(mip, origin.x, origin.z, previous.x, origin.z + WINDOW);
            if (origin.z > previous.z) this.#markBox(mip, origin.x, previous.z + WINDOW, origin.x + WINDOW, origin.z + WINDOW);
            else if (origin.z < previous.z) this.#markBox(mip, origin.x, origin.z, origin.x + WINDOW, previous.z);
        }
    }

    /** A page changed residency: its region is dirty in its own layer and every finer one. @param {number} mip @param {number} x @param {number} z */
    markPage(mip, x, z) {
        for (let level = mip; level >= 0; level--) {
            const scale = 2 ** (mip - level);
            this.#markBox(level, x * scale, z * scale, (x + 1) * scale, (z + 1) * scale);
        }
    }

    markAll() { for (let mip = 0; mip < this.geometry.mips; mip++) { const origin = this.origins[mip]; if (origin) this.#markBox(mip, origin.x, origin.z, origin.x + WINDOW, origin.z + WINDOW); } }

    /**
     * Rebuilds the dirty boxes coarse to fine. Entry RGBA: slot low byte, slot high byte, page mip, 255; the root missing leaves zeros.
     * @param {(mip:number,x:number,z:number)=>number} slotOf resident slot of a page or -1 @returns {number[]} rebuilt layers
     */
    rebuild(slotOf) {
        if (!this.center) throw new Error('[LandscapeSurfaceCache] the indirection needs a center before it is built');
        const rebuilt = [], data = this.data, root = this.geometry.rootMip;
        for (let mip = root; mip >= 0; mip--) {
            const boxes = this.dirty[mip];
            if (!boxes.length) continue;
            const layer = mip * this.layerBytes, parentLayer = (mip + 1) * this.layerBytes, origin = this.origins[mip], pages = landscapeSurfaceCachePagesPerAxis(this.geometry, mip);
            for (const marked of boxes) {
                // boxes marked before a window move are clipped to the current window (a texel outside it now belongs to another page)
                const box = { x0: Math.max(marked.x0, origin.x), z0: Math.max(marked.z0, origin.z), x1: Math.min(marked.x1, origin.x + WINDOW, pages), z1: Math.min(marked.z1, origin.z + WINDOW, pages) };
                if (box.x0 >= box.x1 || box.z0 >= box.z1) continue;
                for (let z = box.z0; z < box.z1; z++) {
                    for (let x = box.x0; x < box.x1; x++) {
                        const offset = layer + ((z & (WINDOW - 1)) * WINDOW + (x & (WINDOW - 1))) * 4, slot = slotOf(mip, x, z);
                        if (slot >= 0) { data[offset] = slot & 255; data[offset + 1] = slot >> 8; data[offset + 2] = mip; data[offset + 3] = 255; }
                        else if (mip < root) {
                            const parent = parentLayer + ((((z >> 1) & (WINDOW - 1)) * WINDOW + ((x >> 1) & (WINDOW - 1))) * 4);
                            data[offset] = data[parent]; data[offset + 1] = data[parent + 1]; data[offset + 2] = data[parent + 2]; data[offset + 3] = data[parent + 3];
                        } else data.fill(0, offset, offset + 4);
                    }
                }
                this.rebuiltEntries += (box.x1 - box.x0) * (box.z1 - box.z0);
            }
            boxes.length = 0;
            rebuilt.push(mip);
        }
        if (rebuilt.length) this.rebuilds++;
        return rebuilt;
    }

    /** CPU lookup mirror of the frame program's single indirection fetch. @param {number} mip @param {number} x @param {number} z */
    entry(mip, x, z) {
        const offset = mip * this.layerBytes + ((z & (WINDOW - 1)) * WINDOW + (x & (WINDOW - 1))) * 4, data = this.data;
        return { slot: data[offset] | (data[offset + 1] << 8), mip: data[offset + 2], valid: data[offset + 3] === 255 };
    }
}
