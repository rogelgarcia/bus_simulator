// Declares the runtime surface cache contract: virtual-texture addressing, clipmap windows, atlas slots, formats, viewport capacity and budget fitting.
// @ts-check
// AI577 D6 (landscape-surface-cache-v1). The cache holds the view-independent composited ground (coverage hierarchy, material lattices, clumps,
// height competition, landscape-scale and terrain-driven variation) in pages of a world-anchored virtual texture: 64x64 texels plus a 4-texel
// gutter per side, mip 0 texels of 1.5625 cm (2^18 texels over 4096 m) and one root page over the whole landscape at the coarsest mip. Each mip
// keeps a toroidal window of windowPages x windowPages pages (64 at 1920x1080) around one center snapped to whole mip-0 pages, so one indirection
// layer per mip resolves every position its window contains to the best resident page; positions outside a window use the next coarser mip.
// Pages live in fixed 72x72 atlas slots with a second, half-resolution level (36x36, 2-texel gutter: the 2x2 box filter of level 0) so a single
// fetch filters trilinearly and 2x anisotropically without leaving its slot.
// Three atlases share the slot grid: albedo + AO (sRGB), the surface normal in the geometric tangent frame + roughness + micro-paired coverage,
// and at half resolution the natural-ground response and coastal reach the lighting pass needs. Natural landscape materials carry metalness 0
// (calibration 'constant', ORM blue 0 in every coastal page), so no metalness is stored.
// AI577 D7 (landscape-surface-cache-capacity-v1): the slot target, the clipmap window and the cache's budget profile scale with the drawing buffer
// above the 1920x1080 reference (3,072 slots, 64-page windows, 512/448 MiB). A drawing buffer finer than the reference moves every mip ring outward:
// the worst view (orthographic, its finest mip at up to two texels per pixel) wants about 4/3 of four pages per 64x64 pixels, so the slots grow with
// the pixel count, and that mip spans the longer side at up to two texels per pixel, so the window grows to the power of two that holds it (a 64-page
// window at 3840x2160 samples up to half of the cached ground one mip coarser than its footprint). Swept over orthographic spans and perspective
// views, the worst demand is 2,936 pages at 1920x1080 (D6's 2,816 slots truncated it), 5,071 at 2560x1440 and 11,083 at 3840x2160.

export const LANDSCAPE_SURFACE_CACHE = Object.freeze({
    id: 'landscape-surface-cache-v1',
    texel0Meters: 4096 / 2 ** 18,
    pageTexels: 64,
    gutterTexels: 4,
    slotTexels: 72,
    slotsPerRow: 16,
    atlasLevels: 2,
    // the window of the 1920x1080 reference and the smallest one (landscapeSurfaceCacheCapacity scales it)
    windowPages: 64,
    maxMips: 16,
    maxAnisotropy: 2,
    // 12 layers, the target of the 1920x1080 reference and the smallest one: the worst demand at 1920x1080 is 2,936 pages (a 33.6 m orthographic
    // top-down view; the 36 AI577 views want at most 2,510), so 2,936 plus the 32 reserved slots fit with 3.5% to spare. D6 used 11 layers (2,816
    // slots), the most its 3/8 ceiling admitted at 512/448 MiB. landscapeSurfaceCacheCapacity scales it with the drawing buffer's pixels
    targetSlots: 3072,
    // the atlas, scratch and indirection never take the GPU bytes the uncached shipped profile gives the streams (streamReserveGpuBytes,
    // LANDSCAPE_STREAMING_BUDGETS.gpuBytes): a profile without room above that reserve keeps the cache off. (D6 also capped them at 3/8 of the GPU
    // limit, which bound no admitted target at 512/448 MiB and would hold a 3840x2160 target to 24 of its 44 layers.)
    streamReserveGpuBytes: 256 * 1024 * 1024,
    // an atlas the budget shrinks below this many slots (or the target, if smaller) is not used: it would truncate most views' demand to coarse
    // rings, below the uncached frame's quality
    minimumSlots: 1024,
    // terrain-reflected light reads the albedo of this mip (1 m texels) at its slot level 1, the coarse ground that stands for the surroundings
    groundMip: 6,
    // pages this coarse are generated from the always-resident overview tile instead of the rendered leaves
    overviewGeometryMip: 9,
    // pages generated per batch (and at most per frame), in blocks of up to 4x4 pages of one mip packed into a 576-texel scratch
    generationBatch: 64,
    blockPages: 4,
    reachScaleMeters: 4,
    // slots kept out of demand so a stale page can be regenerated beside the version that keeps rendering until it publishes
    reservedSlots: 32,
    // a mask level contributes to a page while its spacing exceeds texel / ancestorFilterEndCells; the factor 1.5 covers the warp Jacobian
    maskLevelSafety: 1.5,
    ancestorFilterEndCells: 2,
    formats: Object.freeze({
        albedo: Object.freeze({ internalFormat: 'SRGB8_ALPHA8', levels: 2, scale: 1, channels: Object.freeze(['albedo.r', 'albedo.g', 'albedo.b', 'ao']) }),
        material: Object.freeze({ internalFormat: 'RGBA8', levels: 2, scale: 1, channels: Object.freeze(['normal.hemiOctU', 'normal.hemiOctV', 'roughness', 'microCoverage']) }),
        response: Object.freeze({ internalFormat: 'RGBA8', levels: 1, scale: .5, channels: Object.freeze(['eonRoughness', 'specularShadowingWeight', 'opposition', 'reach/4m']) })
    })
});

/**
 * Residency budget of a view that draws through the surface cache at the 1920x1080 reference capacity (AI577 D6): the uncached shipped CPU limit
 * and the GPU limit that admits the target atlas beside the streams' reserve without a ledger denial (measured peak 402 MiB over the 36 AI577 views
 * at 1920x1080). Larger capacities add their own bytes (landscapeSurfaceCacheBudgets).
 */
export const LANDSCAPE_SURFACE_CACHE_BUDGETS = Object.freeze({ cpuBytes: 512 * 1024 * 1024, gpuBytes: 448 * 1024 * 1024 });

/**
 * Surface cache mode of a landscape view that does not choose one (AI577 D7 decision: on). `landscapeSurfaceCache=on|off` (the view's surfaceCache
 * option) overrides it; off keeps the uncached program exactly as before.
 */
export const LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE = 'on';

/**
 * Viewport capacity policy (AI577 D7): the reference drawing buffer of the D6 capacity, how many drawing-buffer pixels along the longer side one
 * window page must hold (two texels per pixel at the finest mip: 64 texels per page / 2), and the explicit limits. Drawing buffers beyond the limits
 * keep the limit capacity and report surface-cache-viewport-capacity.
 */
export const LANDSCAPE_SURFACE_CACHE_CAPACITY = Object.freeze({
    id: 'landscape-surface-cache-capacity-v1',
    referenceWidth: 1920,
    referenceHeight: 1080,
    pixelsPerWindowPage: 32,
    // 3840x2160: 48 layers (12,288 slots, 668.3 MiB of atlases) and 128-page windows
    maximumSlots: 12288,
    maximumWindowPages: 128
});

const MODEL = LANDSCAPE_SURFACE_CACHE;
const KEY_COORDINATE = 2 ** 15;
const KEY_MIP = KEY_COORDINATE * KEY_COORDINATE;

function finite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[LandscapeSurfaceCache] ${label} must be finite; received ${value}`);
    return value;
}

function integer(value, label, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`[LandscapeSurfaceCache] ${label} must be an integer from ${min} to ${max}; received ${value}`);
    return value;
}

/**
 * Virtual-texture frame of a landscape: origin at its bounds minimum, mip count from its larger extent (coastal 4000 m: mips 0..12 over 4096 m),
 * and the pages per axis of every mip's toroidal window (a power of two from 64 to 256; landscapeSurfaceCacheCapacity chooses it).
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {{windowPages?:number}} [options]
 * @returns {Readonly<{originX:number,originZ:number,rootMip:number,mips:number,pageMeters0:number,texel0Meters:number,extentMeters:number,windowPages:number}>}
 */
export function landscapeSurfaceCacheGeometry(bounds, { windowPages = MODEL.windowPages } = {}) {
    const minX = finite(bounds?.minX, 'bounds.minX'), maxX = finite(bounds?.maxX, 'bounds.maxX'), minZ = finite(bounds?.minZ, 'bounds.minZ'), maxZ = finite(bounds?.maxZ, 'bounds.maxZ');
    if (!(maxX > minX && maxZ > minZ)) throw new Error('[LandscapeSurfaceCache] bounds must have a positive extent');
    if (![64, 128, 256].includes(windowPages)) throw new Error(`[LandscapeSurfaceCache] window pages must be 64, 128 or 256; received ${windowPages}`);
    const pageMeters0 = MODEL.texel0Meters * MODEL.pageTexels, extent = Math.max(maxX - minX, maxZ - minZ);
    const rootMip = Math.max(0, Math.ceil(Math.log2(extent / pageMeters0) - 1e-12));
    if (rootMip >= MODEL.maxMips) throw new Error(`[LandscapeSurfaceCache] a ${extent} m landscape needs ${rootMip + 1} mips; at most ${MODEL.maxMips} are supported`);
    return Object.freeze({ originX: minX, originZ: minZ, rootMip, mips: rootMip + 1, pageMeters0, texel0Meters: MODEL.texel0Meters, extentMeters: pageMeters0 * 2 ** rootMip, windowPages });
}

/**
 * Capacity of a drawing buffer (AI577 D7, landscape-surface-cache-capacity-v1): the slot target grows with the pixel count above the 1920x1080
 * reference in whole 256-slot layers (never below the reference's 3,072 slots), and the window is the smallest power of two from 64 whose pages hold
 * the longer side at two texels per pixel. Both stop at the explicit limits, with the reason surface-cache-viewport-capacity.
 * @param {{width:number,height:number}} drawingBuffer device pixels (CSS pixels times the renderer's pixel ratio)
 * @returns {Readonly<{recipe:string,width:number,height:number,pixels:number,targetSlots:number,windowPages:number,wantedSlots:number,wantedWindowPages:number,reason:string|null}>}
 */
export function landscapeSurfaceCacheCapacity({ width, height }) {
    integer(width, 'drawing-buffer width', 1, 65536); integer(height, 'drawing-buffer height', 1, 65536);
    const policy = LANDSCAPE_SURFACE_CACHE_CAPACITY, perLayer = MODEL.slotsPerRow ** 2, referenceLayers = MODEL.targetSlots / perLayer;
    const scale = width * height / (policy.referenceWidth * policy.referenceHeight);
    const wantedSlots = Math.max(referenceLayers, Math.ceil(referenceLayers * scale - 1e-9)) * perLayer;
    let wantedWindowPages = MODEL.windowPages;
    while (wantedWindowPages * policy.pixelsPerWindowPage < Math.max(width, height)) wantedWindowPages *= 2;
    const targetSlots = Math.min(wantedSlots, policy.maximumSlots), windowPages = Math.min(wantedWindowPages, policy.maximumWindowPages);
    return Object.freeze({ recipe: policy.id, width, height, pixels: width * height, targetSlots, windowPages, wantedSlots, wantedWindowPages,
        reason: targetSlots < wantedSlots || windowPages < wantedWindowPages ? 'surface-cache-viewport-capacity' : null });
}

/**
 * Residency budget profile of a view that draws through the surface cache at a capacity: LANDSCAPE_SURFACE_CACHE_BUDGETS plus the GPU bytes of the
 * capacity's layers and indirection beyond the reference (indirection for the most mips a landscape may have), in whole MiB. The streams keep the
 * room they have at the reference; 1920x1080 keeps 512/448 MiB exactly.
 * @param {{targetSlots:number,windowPages:number}} capacity
 */
export function landscapeSurfaceCacheBudgets({ targetSlots, windowPages }) {
    const perLayer = MODEL.slotsPerRow ** 2;
    integer(targetSlots, 'target slots', MODEL.targetSlots, perLayer * 1024);
    if (targetSlots % perLayer) throw new Error(`[LandscapeSurfaceCache] target slots must be a multiple of ${perLayer}; received ${targetSlots}`);
    landscapeSurfaceCacheGeometry({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, { windowPages });
    const layerBytes = landscapeSurfaceCacheSlotLayout({ slots: perLayer }).layerBytes;
    const extra = (targetSlots - MODEL.targetSlots) / perLayer * layerBytes + (windowPages ** 2 - MODEL.windowPages ** 2) * 4 * MODEL.maxMips, mib = 1024 * 1024;
    return Object.freeze({ cpuBytes: LANDSCAPE_SURFACE_CACHE_BUDGETS.cpuBytes, gpuBytes: LANDSCAPE_SURFACE_CACHE_BUDGETS.gpuBytes + Math.ceil(extra / mib) * mib });
}

/** @param {{pageMeters0:number,rootMip:number}} geometry @param {number} mip */
export function landscapeSurfaceCachePageMeters(geometry, mip) { return geometry.pageMeters0 * 2 ** integer(mip, 'mip', 0, geometry.rootMip); }

/** @param {{rootMip:number}} geometry @param {number} mip */
export function landscapeSurfaceCachePagesPerAxis(geometry, mip) { return 2 ** (geometry.rootMip - integer(mip, 'mip', 0, geometry.rootMip)); }

/** @param {number} mip @param {number} x @param {number} z @returns {number} a safe-integer page key */
export function landscapeSurfaceCachePageKey(mip, x, z) {
    integer(mip, 'mip', 0, MODEL.maxMips - 1); integer(x, 'page x', 0, KEY_COORDINATE - 1); integer(z, 'page z', 0, KEY_COORDINATE - 1);
    return mip * KEY_MIP + z * KEY_COORDINATE + x;
}

/** @param {number} key @returns {{mip:number,x:number,z:number}} */
export function parseLandscapeSurfaceCachePageKey(key) {
    integer(key, 'page key', 0, MODEL.maxMips * KEY_MIP - 1);
    const mip = Math.floor(key / KEY_MIP), rest = key - mip * KEY_MIP, z = Math.floor(rest / KEY_COORDINATE);
    return { mip, x: rest - z * KEY_COORDINATE, z };
}

/**
 * World bounds of a page; with gutter the bounds of its whole 72x72 slot (4 texels beyond the page on every side).
 * @param {any} geometry @param {number} mip @param {number} x @param {number} z @param {{gutter?:boolean}} [options]
 */
export function landscapeSurfaceCachePageBounds(geometry, mip, x, z, { gutter = false } = {}) {
    const pages = landscapeSurfaceCachePagesPerAxis(geometry, mip), size = landscapeSurfaceCachePageMeters(geometry, mip);
    integer(x, 'page x', 0, pages - 1); integer(z, 'page z', 0, pages - 1);
    const margin = gutter ? size * MODEL.gutterTexels / MODEL.pageTexels : 0;
    return { minX: geometry.originX + x * size - margin, maxX: geometry.originX + (x + 1) * size + margin, minZ: geometry.originZ + z * size - margin, maxZ: geometry.originZ + (z + 1) * size + margin };
}

/** Texel size of a mip in meters. @param {any} geometry @param {number} mip */
export function landscapeSurfaceCacheTexelMeters(geometry, mip) { return landscapeSurfaceCachePageMeters(geometry, mip) / MODEL.pageTexels; }

/**
 * The clipmap center in virtual meters (from the origin), snapped to whole mip-0 pages and clamped to the virtual extent, so every window origin
 * the shader derives from it (floor of an integer over a power of two) is exact in single precision.
 * @param {any} geometry @param {number} worldX @param {number} worldZ
 */
export function landscapeSurfaceCacheSnapCenter(geometry, worldX, worldZ) {
    finite(worldX, 'center x'); finite(worldZ, 'center z');
    const snap = value => Math.min(geometry.extentMeters, Math.max(0, Math.round(value / geometry.pageMeters0) * geometry.pageMeters0));
    return Object.freeze({ x: snap(worldX - geometry.originX), z: snap(worldZ - geometry.originZ) });
}

/**
 * First page of a mip's toroidal window: half a window before the center's page, clamped to the virtual texture (windows of mips with at most
 * windowPages pages per axis cover the whole landscape).
 * @param {any} geometry @param {number} mip @param {{x:number,z:number}} center virtual meters
 */
export function landscapeSurfaceCacheWindowOrigin(geometry, mip, center) {
    const window = geometry.windowPages, size = landscapeSurfaceCachePageMeters(geometry, mip), last = Math.max(0, landscapeSurfaceCachePagesPerAxis(geometry, mip) - window);
    const axis = value => Math.min(last, Math.max(0, Math.floor(value / size) - window / 2));
    return { x: axis(center.x), z: axis(center.z) };
}

/** @param {any} geometry @param {number} mip @param {{x:number,z:number}} center @param {number} x @param {number} z */
export function landscapeSurfaceCacheWindowContains(geometry, mip, center, x, z) {
    const origin = landscapeSurfaceCacheWindowOrigin(geometry, mip, center), pages = landscapeSurfaceCachePagesPerAxis(geometry, mip), window = geometry.windowPages;
    return x >= origin.x && z >= origin.z && x < origin.x + window && z < origin.z + window && x < pages && z < pages;
}

/** Filtered footprint the atlas sampler resolves with a given anisotropy: max(major / anisotropy, minor) of the planar derivative vectors. */
export function landscapeSurfaceCacheFootprint(dx, dy, anisotropy = MODEL.maxAnisotropy) {
    const a = Math.hypot(dx[0], dx[1]), b = Math.hypot(dy[0], dy[1]);
    return Math.max(Math.max(a, b) / anisotropy, Math.min(a, b));
}

/**
 * Page mip the frame program samples (mirror of landscapeSurfaceCacheMip in surface_cache.glsl): the finer trilinear level of the footprint,
 * raised until the mip's window contains the position. vx, vz are virtual meters.
 * @param {any} geometry @param {{x:number,z:number}} center @param {number} vx @param {number} vz @param {number} footprint meters
 */
export function landscapeSurfaceCacheFrameMip(geometry, center, vx, vz, footprint) {
    let mip = Math.min(geometry.rootMip, Math.max(0, Math.floor(Math.log2(Math.max(footprint, 1e-9) / geometry.texel0Meters))));
    for (; mip < geometry.rootMip; mip++) {
        const size = landscapeSurfaceCachePageMeters(geometry, mip);
        if (landscapeSurfaceCacheWindowContains(geometry, mip, center, Math.floor(vx / size), Math.floor(vz / size))) break;
    }
    return mip;
}

/**
 * Fixed atlas slot grid: 16x16 slots of 72 texels per array layer (1152 texels; level 1 and the response atlas 576), so slot counts are fitted in
 * steps of one 256-slot layer.
 * @param {{slots:number}} options
 */
export function landscapeSurfaceCacheSlotLayout({ slots }) {
    const perRow = MODEL.slotsPerRow, perLayer = perRow * perRow;
    integer(slots, 'slots', perLayer, perLayer * 1024);
    if (slots % perLayer) throw new Error(`[LandscapeSurfaceCache] slots must be a multiple of ${perLayer}; received ${slots}`);
    const layerTexels = perRow * MODEL.slotTexels, half = layerTexels / 2;
    const layerBytes = layerTexels * layerTexels * 4 * 2 + half * half * 4 * 3;
    return Object.freeze({ slots, perRow, perLayer, layers: slots / perLayer, layerTexels, levelOneTexels: half, responseTexels: half, layerBytes, slotBytes: layerBytes / perLayer,
        atlasBytes: layerBytes * slots / perLayer });
}

/** Layer, column and row of a slot and its texel origin in level 0, level 1 and the response atlas. @param {any} layout @param {number} slot */
export function landscapeSurfaceCacheSlotPosition(layout, slot) {
    integer(slot, 'slot', 0, layout.slots - 1);
    const layer = Math.floor(slot / layout.perLayer), inLayer = slot - layer * layout.perLayer, row = Math.floor(inLayer / layout.perRow), column = inLayer - row * layout.perRow;
    const half = MODEL.slotTexels / 2;
    return Object.freeze({ layer, column, row, x0: column * MODEL.slotTexels, y0: row * MODEL.slotTexels, x1: column * half, y1: row * half });
}

/**
 * Farthest texel a filtered fetch inside a page can touch beyond the page edge, in texels of the slot level it samples: probes spread over the
 * anisotropic major axis (anisotropy x 2^lod level-0 texels at hardware lod in [0, 1)), each probe bilinear (+1 texel), at the trilinear level
 * weight given (level 0 is sampled with weight 1 - lod, level 1 with lod). A fetch is seam-free while this stays within the level's gutter
 * (4 texels at level 0, 2 at level 1). @param {{anisotropy:number,level:0|1,minimumWeight?:number}} options
 */
export function landscapeSurfaceCacheFilterReach({ anisotropy, level, minimumWeight = 0 }) {
    finite(anisotropy, 'anisotropy');
    if (level !== 0 && level !== 1) throw new Error('[LandscapeSurfaceCache] slots have levels 0 and 1');
    // the largest lod at which this level still carries at least minimumWeight of the trilinear blend
    const lod = level === 0 ? Math.min(1, 1 - minimumWeight) : 1;
    return anisotropy * 2 ** (lod - level) / 2 + 1;
}

/** Gutter of a slot level in that level's texels. @param {0|1} level */
export function landscapeSurfaceCacheGutter(level) { return MODEL.gutterTexels / 2 ** level; }

/**
 * Compile-time constants of the cache shaders (surface_cache.glsl and the generation outputs), from this contract. The window is not one of them:
 * the frame reads it from the indirection texture's size, so one linked program serves every capacity.
 * @returns {Readonly<Record<string, string>>}
 */
export function landscapeSurfaceCacheDefines() {
    const float = value => Number.isInteger(value) ? `${value}.0` : String(value);
    return Object.freeze({
        LANDSCAPE_SURFACE_CACHE_TEXEL0: float(MODEL.texel0Meters),
        LANDSCAPE_SURFACE_CACHE_PAGE_TEXELS: float(MODEL.pageTexels),
        LANDSCAPE_SURFACE_CACHE_GUTTER: float(MODEL.gutterTexels),
        LANDSCAPE_SURFACE_CACHE_SLOT: float(MODEL.slotTexels),
        LANDSCAPE_SURFACE_CACHE_MAX_MIPS: `(${MODEL.maxMips})`,
        LANDSCAPE_SURFACE_CACHE_GROUND_MIP: `(${MODEL.groundMip})`,
        LANDSCAPE_SURFACE_CACHE_REACH_SCALE: float(MODEL.reachScaleMeters)
    });
}

/**
 * Generation scratch: the generation program writes one batch of up to 64 pages (as many 72x72 slots as an 8x8 grid holds), packed three bytes
 * per float into RGBA32F, which the unpack pass copies into the level-0 slots and box-filters into the level-1 slots and the response atlas. A
 * single output keeps the generation program free of ANGLE's draw-time compile of a multiple-target pixel shader.
 */
export function landscapeSurfaceCacheScratchLayout() {
    const perRow = Math.sqrt(MODEL.generationBatch), texels = perRow * MODEL.slotTexels;
    return Object.freeze({ batch: MODEL.generationBatch, perRow, texels, bytesPerTexel: 16, bytes: texels * texels * 16 });
}

/**
 * Groups generation candidates into blocks of up to blockPages x blockPages pages of one mip (aligned to multiples of blockPages) and packs their level-0
 * scratch rectangles (the pages of the block's bounding rectangle plus one gutter around it) on shelves. One draw per block keeps the GPU busy with
 * thousands of fragments instead of one 72x72 viewport per page; each page's slot region is the block rectangle offset by its page position.
 * Candidates whose block does not fit are returned as deferred, in input order.
 * @param {ReadonlyArray<{mip:number,x:number,z:number}>} pages @param {{blockPages?:number,scratchTexels?:number}} [options]
 */
export function packLandscapeSurfaceCacheBlocks(pages, { blockPages = MODEL.blockPages, scratchTexels = landscapeSurfaceCacheScratchLayout().texels } = {}) {
    const groups = new Map();
    for (const page of pages) {
        const key = `${page.mip}/${Math.floor(page.x / blockPages)}/${Math.floor(page.z / blockPages)}`;
        let group = groups.get(key);
        if (!group) { group = { mip: page.mip, x0: page.x, x1: page.x, z0: page.z, z1: page.z, pages: [] }; groups.set(key, group); }
        group.x0 = Math.min(group.x0, page.x); group.x1 = Math.max(group.x1, page.x); group.z0 = Math.min(group.z0, page.z); group.z1 = Math.max(group.z1, page.z);
        group.pages.push(page);
    }
    const blocks = [...groups.values()].map(group => ({ ...group, width: (group.x1 - group.x0 + 1) * MODEL.pageTexels + 2 * MODEL.gutterTexels,
        height: (group.z1 - group.z0 + 1) * MODEL.pageTexels + 2 * MODEL.gutterTexels })).sort((a, b) => b.height - a.height || b.width - a.width);
    const placed = [], deferred = [];
    let shelfY = 0, shelfHeight = 0, cursorX = 0;
    for (const block of blocks) {
        if (cursorX + block.width > scratchTexels) { shelfY += shelfHeight; shelfHeight = 0; cursorX = 0; }
        if (block.width > scratchTexels || shelfY + block.height > scratchTexels) { deferred.push(...block.pages); continue; }
        placed.push({ ...block, origin: { x: cursorX, y: shelfY } });
        cursorX += block.width;
        shelfHeight = Math.max(shelfHeight, block.height);
    }
    const order = new Map(pages.map((page, index) => [page, index]));
    return { blocks: placed, deferred: deferred.sort((a, b) => order.get(a) - order.get(b)) };
}

/** Scratch origin of a page's 72x72 slot region inside its packed block. @param {{x0:number,z0:number,origin:{x:number,y:number}}} block @param {{x:number,z:number}} page */
export function landscapeSurfaceCacheBlockPageOrigin(block, page) {
    return { x: block.origin.x + (page.x - block.x0) * MODEL.pageTexels, y: block.origin.y + (page.z - block.z0) * MODEL.pageTexels };
}

/** Indirection storage: one RGBA8UI window x window layer per mip, mirrored on the CPU. @param {{mips:number,windowPages:number}} geometry */
export function landscapeSurfaceCacheIndirectionBytes(geometry) {
    return integer(geometry.windowPages, 'window pages', 64, 256) ** 2 * 4 * integer(geometry.mips, 'mips', 1, MODEL.maxMips);
}

/**
 * Fits the atlas to its explicit GPU ceiling (the shared GPU limit less the streams' reserve) and to the GPU bytes the ledger still has available
 * when given: whole 256-slot layers up to the target. Fewer slots than the target report
 * `surface-cache-gpu-ceiling`, or `surface-cache-gpu-available` when the ledger's free bytes bound them (a cache switched on beside resident
 * streams shrinks instead of displacing them); fewer than the minimum (no layer at all, or fewer than minimumSlots or the target if smaller)
 * report `surface-cache-gpu-budget` with no slots, a device below 1152 texels or the target's layer count `surface-cache-device-capacity`.
 * @param {{limits:{cpuBytes:number,gpuBytes:number},available?:{gpuBytes:number}|null,geometry:{mips:number,windowPages:number},targetSlots?:number,maxTextureSize?:number,maxArrayLayers?:number}} options
 */
export function fitLandscapeSurfaceCache({ limits, available = null, geometry, targetSlots = MODEL.targetSlots, maxTextureSize = 16384, maxArrayLayers = 2048 }) {
    const gpuLimit = integer(limits?.gpuBytes, 'GPU limit', 0, Number.MAX_SAFE_INTEGER), cpuLimit = integer(limits?.cpuBytes, 'CPU limit', 0, Number.MAX_SAFE_INTEGER);
    const unit = landscapeSurfaceCacheSlotLayout({ slots: MODEL.slotsPerRow ** 2 }), perLayer = unit.perLayer;
    integer(targetSlots, 'target slots', perLayer, perLayer * 1024);
    // fixed: the indirection layers and the packed float scratch the generation program writes one batch of pages to
    const indirection = landscapeSurfaceCacheIndirectionBytes(geometry), scratch = landscapeSurfaceCacheScratchLayout().bytes;
    const ceiling = Math.max(0, gpuLimit - MODEL.streamReserveGpuBytes);
    const free = available ? Math.max(0, integer(Math.floor(available.gpuBytes), 'available GPU bytes', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)) : Infinity;
    const layersIn = bytes => Math.max(0, Math.floor((bytes - indirection - scratch) / unit.layerBytes));
    const wanted = Math.ceil(targetSlots / perLayer), underCeiling = layersIn(ceiling), fitting = Math.min(underCeiling, layersIn(free));
    const deviceLayers = maxTextureSize >= unit.layerTexels ? Math.min(maxArrayLayers, 1024) : 0;
    const minimum = Math.ceil(Math.min(targetSlots, MODEL.minimumSlots) / perLayer);
    let layers = Math.min(wanted, fitting, deviceLayers), reason = null;
    if (layers < wanted) {
        reason = deviceLayers < Math.min(wanted, fitting) ? 'surface-cache-device-capacity' : layers < minimum ? 'surface-cache-gpu-budget'
            : fitting < Math.min(wanted, underCeiling) ? 'surface-cache-gpu-available' : 'surface-cache-gpu-ceiling';
        if (layers < minimum) layers = 0;
    }
    const slots = layers * perLayer, atlasBytes = layers * unit.layerBytes;
    // CPU: the indirection mirror and the slot table of page keys (Float64Array)
    const cpuBytes = layers ? indirection + slots * 8 : 0;
    return Object.freeze({ slots, layers, targetSlots, atlasBytes, indirectionBytes: indirection, scratchBytes: layers ? scratch : 0, gpuBytes: layers ? atlasBytes + scratch + indirection : 0, cpuBytes,
        ceilingBytes: ceiling, slotBytes: unit.slotBytes, reason: cpuBytes > cpuLimit ? 'surface-cache-cpu-budget' : reason });
}

/**
 * Finest mask level that can still contribute to a page of this mip: the generation footprint walk skips a level whose spacing is at most
 * texel / ancestorFilterEndCells, and the warp Jacobian (norm <= 0.42) widens the margin by maskLevelSafety. Returns the highest level index
 * (coarsest 0) whose spacing exceeds the threshold; the root level always contributes, since the walk cannot pass it.
 * @param {any} geometry @param {number} mip @param {readonly number[]} levelSpacings
 */
export function landscapeSurfaceCacheMaskLevel(geometry, mip, levelSpacings) {
    const threshold = landscapeSurfaceCacheTexelMeters(geometry, mip) / (MODEL.ancestorFilterEndCells * MODEL.maskLevelSafety);
    let level = 0;
    for (let index = 0; index < levelSpacings.length; index++) if (finite(levelSpacings[index], 'level spacing') > threshold) level = index;
    return level;
}

/**
 * A material tier whose texel is at most half the page texel resolves the page through its mip chain like any finer tier, so its key is 'resolved';
 * coarser tiers are part of the page identity by resolution. @param {{tileMeters:number,resolution:number,texelMeters:number}} options
 */
export function landscapeSurfaceCacheTierKey({ tileMeters, resolution, texelMeters }) {
    finite(tileMeters, 'tileMeters'); finite(resolution, 'resolution'); finite(texelMeters, 'texelMeters');
    return tileMeters / resolution <= texelMeters / 2 ? 'resolved' : String(resolution);
}

/** Hemi-octahedral encoding (Cigolle et al. 2014) of a unit vector with z >= 0 into [0, 1]^2, mirrored by the GLSL encoder. @param {readonly number[]} v */
export function encodeLandscapeHemiOctahedral(v) {
    const [x, y, z] = v, sum = Math.abs(x) + Math.abs(y) + Math.max(z, 0);
    const px = x / sum, py = y / sum;
    return [(px + py) * .5 + .5, (px - py) * .5 + .5];
}

/** @param {readonly number[]} e @returns {number[]} unit vector */
export function decodeLandscapeHemiOctahedral(e) {
    const u = e[0] * 2 - 1, v = e[1] * 2 - 1, x = (u + v) * .5, y = (u - v) * .5, z = 1 - Math.abs(x) - Math.abs(y), length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length];
}

/** Tangent frame of the geometric normal used by the generation encoder and the frame decoder (the soil lattices' top-projection frame). @param {readonly number[]} n */
export function landscapeSurfaceCacheTangentFrame(n) {
    const tx = n[1], ty = -n[0], tl = Math.hypot(tx, ty);
    const tangent = [tx / tl, ty / tl, 0];
    const bx = tangent[1] * n[2] - tangent[2] * n[1], by = tangent[2] * n[0] - tangent[0] * n[2], bz = tangent[0] * n[1] - tangent[1] * n[0], bl = Math.hypot(bx, by, bz);
    return { tangent, north: [bx / bl, by / bl, bz / bl] };
}

/** 53-bit FNV-1a of a string as 14 hex digits (two 32-bit lanes). @param {string} text */
export function landscapeSurfaceCacheHash(text) {
    if (typeof text !== 'string') throw new Error('[LandscapeSurfaceCache] identity input must be a string');
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193) >>> 0;
        b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
        b ^= b >>> 15;
    }
    return (a >>> 0).toString(16).padStart(8, '0') + ((b >>> 0) & 0x1fffff).toString(16).padStart(6, '0');
}

/**
 * Page identity: the global generation key (recipe, program, switches, seeds, calibration, bindings), the page address, the identities of the mask
 * pages at its contributing levels (with margin), the tier keys of the soils they hold, and the geometry tiles it is drawn from (their heights and
 * normals drive slope- and height-dependent appearance). Camera, light and time never enter it.
 * @param {{global:string,mip:number,x:number,z:number,masks:readonly string[],soils:readonly string[],tiles?:readonly string[]}} input
 */
export function landscapeSurfaceCachePageIdentity({ global, mip, x, z, masks, soils, tiles = [] }) {
    if (typeof global !== 'string' || !Array.isArray(masks) || !Array.isArray(soils) || !Array.isArray(tiles)) throw new Error('[LandscapeSurfaceCache] identity needs a global key and mask, soil and tile lists');
    return landscapeSurfaceCacheHash(`${MODEL.id}|${global}|${landscapeSurfaceCachePageKey(mip, x, z)}|m:${[...masks].sort().join(',')}|s:${[...soils].sort().join(',')}|t:${[...tiles].sort().join(',')}`);
}
