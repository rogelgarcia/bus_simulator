// Plans the surface cache pages a camera needs: a quadtree descent of the virtual texture by projected texel density inside the clipmap windows.
// @ts-check
// AI577 D6 demand (landscape-surface-cache-demand-v2), deterministic and CPU-only. A page is desired while it intersects the view frustum
// (with the terrain height envelope of the ground it covers); it is refined while the finest filtered footprint inside it, estimated at its
// closest point from the grazing angle plus the steepest overview slope there and the sampler anisotropy, is smaller than its texel and its
// children lie in the next window. Every desired page's ancestors are desired too (the coarser ring), so zooming keeps the previous band until
// finer pages replace it. Priority is the closest distance in page sizes, which keeps parents ahead of children and, when the demand exceeds the
// atlas, drops the outer part of every mip ring alike (the effect of a global LOD bias). A motion prefetch runs the same descent for the camera
// extrapolated half a second ahead. The clipmap center follows the camera's ground position, shifted forward for narrow fields of view whose fine
// pages lie ahead of a centered window. v2: while the near pass evaluates the fragments whose footprint lies below its band start per pixel, a page
// whose largest footprint (its farthest point at the shallowest grazing angle its envelope allows) lies below that start is never sampled and is
// neither desired nor refined; the descent allocates nothing per visited node.
import { LANDSCAPE_SURFACE_CACHE, landscapeSurfaceCachePageBounds, landscapeSurfaceCachePageKey, landscapeSurfaceCacheSnapCenter } from './LandscapeSurfaceCacheLayout.js';

export const LANDSCAPE_SURFACE_CACHE_DEMAND = Object.freeze({
    id: 'landscape-surface-cache-demand-v2',
    footprint: 'closest-point footprint max(major / anisotropy, minor), major = minor / min(1, grazing sine + steepest overview slope sine)',
    minimumGrazingSine: .02,
    prefetchSeconds: .5,
    prefetchMinimumSpeed: .5,
    prefetchPriorityOffset: 8,
    centerHysteresisMeters: 2,
    centerShiftLimitMeters: 24,
    maximumNodes: 60000
});

const DEMAND = LANDSCAPE_SURFACE_CACHE_DEMAND;
// page keys (landscapeSurfaceCachePageKey without its validation, for the descent's inner loop)
const KEY_COORDINATE = 2 ** 15, KEY_MIP = KEY_COORDINATE * KEY_COORDINATE;

/**
 * Terrain envelope of page bounds from the always-resident overview chunk: min/max height of the overview cells a rectangle touches, widened by the
 * overview's geometric error so it bounds every native sample, and the sine of their steepest overview-cell slope. A max/min pyramid answers each
 * query from at most four cells; with an output array the query writes [min, max, slope] into it instead of allocating a result.
 * @param {{descriptor:{columns:number,rows:number,bounds:any,geometricError:number},heights:Float32Array}} chunk overview chunk (row 0 north)
 * @returns {(minX:number,minZ:number,maxX:number,maxZ:number,out?:Float64Array)=>any}
 */
export function createLandscapeSurfaceCacheTerrainEnvelope(chunk) {
    const { columns, rows, bounds, geometricError } = chunk.descriptor, heights = chunk.heights;
    if (!(heights instanceof Float32Array) || heights.length !== columns * rows || columns < 2 || rows < 2) throw new Error('[LandscapeSurfaceCache] the terrain envelope needs the decoded overview heights');
    const cellsX = columns - 1, cellsZ = rows - 1, dx = (bounds.maxX - bounds.minX) / cellsX, dz = (bounds.maxZ - bounds.minZ) / cellsZ;
    const levels = [];
    let width = cellsX, height = cellsZ;
    const base = { width, height, min: new Float32Array(width * height), max: new Float32Array(width * height), slope: new Float32Array(width * height) };
    for (let r = 0; r < cellsZ; r++) for (let c = 0; c < cellsX; c++) {
        const a = heights[r * columns + c], b = heights[r * columns + c + 1], d = heights[(r + 1) * columns + c], e = heights[(r + 1) * columns + c + 1], i = r * cellsX + c;
        base.min[i] = Math.min(a, b, d, e) - geometricError; base.max[i] = Math.max(a, b, d, e) + geometricError;
        const gx = (b + e - a - d) / (2 * dx), gz = (a + b - d - e) / (2 * dz), g = Math.hypot(gx, gz);
        base.slope[i] = g / Math.hypot(1, g);
    }
    levels.push(base);
    while (width > 1 || height > 1) {
        const previous = levels.at(-1), next = { width: Math.ceil(width / 2), height: Math.ceil(height / 2) };
        Object.assign(next, { min: new Float32Array(next.width * next.height).fill(Infinity), max: new Float32Array(next.width * next.height).fill(-Infinity), slope: new Float32Array(next.width * next.height) });
        for (let r = 0; r < previous.height; r++) for (let c = 0; c < previous.width; c++) {
            const from = r * previous.width + c, to = (r >> 1) * next.width + (c >> 1);
            next.min[to] = Math.min(next.min[to], previous.min[from]); next.max[to] = Math.max(next.max[to], previous.max[from]); next.slope[to] = Math.max(next.slope[to], previous.slope[from]);
        }
        levels.push(next);
        width = next.width; height = next.height;
    }
    const minimumX = bounds.minX, maximumZ = bounds.maxZ;
    return (minX, minZ, maxX, maxZ, out = null) => {
        const c0 = Math.min(cellsX - 1, Math.max(0, Math.floor((minX - minimumX) / dx))), c1 = Math.min(cellsX - 1, Math.max(0, Math.floor((maxX - minimumX) / dx)));
        const r0 = Math.min(cellsZ - 1, Math.max(0, Math.floor((maximumZ - maxZ) / dz))), r1 = Math.min(cellsZ - 1, Math.max(0, Math.floor((maximumZ - minZ) / dz)));
        let level = 0;
        while (level < levels.length - 1 && ((c1 >> level) - (c0 >> level) > 1 || (r1 >> level) - (r0 >> level) > 1)) level++;
        const grid = levels[level];
        let min = Infinity, max = -Infinity, slope = 0;
        for (let r = r0 >> level; r <= r1 >> level; r++) for (let c = c0 >> level; c <= c1 >> level; c++) {
            const i = r * grid.width + c;
            if (grid.min[i] < min) min = grid.min[i];
            if (grid.max[i] > max) max = grid.max[i];
            if (grid.slope[i] > slope) slope = grid.slope[i];
        }
        if (out) { out[0] = min; out[1] = max; out[2] = slope; return out; }
        return { min, max, slope };
    };
}

/**
 * Clipmap center for a camera (virtual meters, snapped to mip-0 pages): the camera's ground position, shifted along the horizontal view
 * direction by the distance the finest mip extends beyond half a centered window (narrow perspective fields), or the ground point of an
 * orthographic view axis; kept while it moves less than the hysteresis.
 * @param {{geometry:any,camera:any,groundHeight:number,previous?:{x:number,z:number}|null}} options
 */
export function chooseLandscapeSurfaceCacheCenter({ geometry, camera, groundHeight, previous = null }) {
    const { position, direction } = camera;
    let x = position.x, z = position.z;
    if (camera.projection === 'orthographic') {
        if (direction.y < -.1) { const t = (position.y - groundHeight) / -direction.y; x += direction.x * t; z += direction.z * t; }
    } else {
        const horizontal = Math.hypot(direction.x, direction.z);
        if (horizontal > .1) {
            const pixelAngle = 2 * Math.tan(camera.fovYRadians / 2) / camera.zoom / camera.viewportHeight;
            const reach = geometry.texel0Meters / pixelAngle, shift = Math.min(DEMAND.centerShiftLimitMeters, Math.max(0, reach - LANDSCAPE_SURFACE_CACHE.windowPages / 4 * geometry.pageMeters0));
            x += direction.x / horizontal * shift; z += direction.z / horizontal * shift;
        }
    }
    const center = landscapeSurfaceCacheSnapCenter(geometry, x, z);
    if (previous && Math.abs(previous.x - center.x) <= DEMAND.centerHysteresisMeters && Math.abs(previous.z - center.z) <= DEMAND.centerHysteresisMeters) return previous;
    return center;
}

/**
 * Desired pages of one camera, sorted by priority and limited to capacity.
 * @param {{geometry:any,camera:any,center:{x:number,z:number},heightRange:(minX:number,minZ:number,maxX:number,maxZ:number,out?:Float64Array)=>any,capacity:number,
 *   anisotropy?:number,velocity?:{x:number,y:number,z:number}|null,bounds?:{minX:number,maxX:number,minZ:number,maxZ:number}|null,nearStart?:number}} options camera is a
 *   landscapeCameraSnapshot (inward frustum planes {x,y,z,w}); heightRange gives the terrain height envelope and the sine of its steepest slope; pages outside bounds
 *   (the landscape) are never desired; nearStart (meters, 0 without a near pass) prunes pages entirely below the near pass's band start; views are further
 *   prefetch cameras (landscapeCameraSnapshot) planned after the motion prefetch; lodBias (mips, from 0) widens the refinement footprint by 2^lodBias
 * @returns {{pages:Array<{key:number,mip:number,x:number,z:number,priority:number,distance:number,prefetch:boolean}>,desired:number,visited:number,limited:boolean,byMip:number[],
 *   pruned:number}}
 */
export function planLandscapeSurfaceCacheDemand({ geometry, camera, center, heightRange, capacity, anisotropy = LANDSCAPE_SURFACE_CACHE.maxAnisotropy, velocity = null, bounds = null,
    nearStart = 0, views = [], lodBias = 0 }) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('[LandscapeSurfaceCache] demand capacity must be a positive integer');
    const orthographic = camera.projection === 'orthographic';
    const pixelAngle = orthographic ? 0 : 2 * Math.tan(camera.fovYRadians / 2) / camera.zoom / camera.viewportHeight;
    const orthoPixel = orthographic ? camera.orthoHeight / camera.zoom / camera.viewportHeight : 0;
    const minimumSine = DEMAND.minimumGrazingSine, pageTexels = LANDSCAPE_SURFACE_CACHE.pageTexels, window = LANDSCAPE_SURFACE_CACHE.windowPages;
    const stretch = sine => Math.max(1, 1 / (anisotropy * Math.min(1, Math.max(sine, minimumSine)))), bias = 2 ** Math.max(0, lodBias);
    // per mip: page size, pages per axis and the clipmap window origin
    const mips = geometry.mips, sizes = new Float64Array(mips), perAxis = new Int32Array(mips), originX = new Int32Array(mips), originZ = new Int32Array(mips);
    for (let mip = 0; mip < mips; mip++) {
        sizes[mip] = geometry.pageMeters0 * 2 ** mip;
        perAxis[mip] = 2 ** (geometry.rootMip - mip);
        const last = Math.max(0, perAxis[mip] - window);
        originX[mip] = Math.min(last, Math.max(0, Math.floor(center.x / sizes[mip]) - window / 2));
        originZ[mip] = Math.min(last, Math.max(0, Math.floor(center.z / sizes[mip]) - window / 2));
    }
    const ox = geometry.originX, oz = geometry.originZ, envelope = new Float64Array(3);
    const pages = new Map();
    let visited = 0, pruned = 0, stack = new Int32Array(3 * 1024);
    const descend = (eye, planes, offset, prefetch) => {
        const p = planes.map(plane => [plane.x, plane.y, plane.z, plane.w]);
        let top = 0;
        stack[top++] = geometry.rootMip; stack[top++] = 0; stack[top++] = 0;
        while (top > 0 && visited < DEMAND.maximumNodes) {
            const z = stack[--top], x = stack[--top], mip = stack[--top];
            visited++;
            const size = sizes[mip], minX = ox + x * size, maxX = minX + size, minZ = oz + z * size, maxZ = minZ + size;
            if (bounds && (minX >= bounds.maxX || maxX <= bounds.minX || minZ >= bounds.maxZ || maxZ <= bounds.minZ)) continue;
            // an envelope that fills the output array allocates nothing; a plain function may return {min, max, slope}
            const range = heightRange(minX, minZ, maxX, maxZ, envelope), filled = range === envelope;
            const minY = filled ? envelope[0] : range.min, maxY = filled ? envelope[1] : range.max, slope = filled ? envelope[2] : range.slope;
            let outside = false;
            for (let i = 0; i < p.length; i++) {
                const [a, b, c, d] = p[i];
                if (a * (a >= 0 ? maxX : minX) + b * (b >= 0 ? maxY : minY) + c * (c >= 0 ? maxZ : minZ) + d < 0) { outside = true; break; }
            }
            if (outside) continue;
            const cx = Math.min(maxX, Math.max(minX, eye.x)), cy = Math.min(maxY, Math.max(minY, eye.y)), cz = Math.min(maxZ, Math.max(minZ, eye.z));
            const distance = Math.hypot(eye.x - cx, eye.y - cy, eye.z - cz);
            if (nearStart > 0) {
                // the largest footprint in the page: its farthest corner at the shallowest grazing its envelope allows
                const fx = Math.max(Math.abs(eye.x - minX), Math.abs(eye.x - maxX)), fy = Math.max(Math.abs(eye.y - minY), Math.abs(eye.y - maxY)), fz = Math.max(Math.abs(eye.z - minZ), Math.abs(eye.z - maxZ));
                const far = Math.hypot(fx, fy, fz), sine = far > 0 && eye.y > maxY ? (eye.y - maxY) / far - slope : 0;
                const largest = orthographic ? orthoPixel * stretch(Math.abs(camera.direction.y) - slope) : far * pixelAngle * stretch(sine);
                if (largest < nearStart) { pruned++; continue; }
            }
            const key = mip * KEY_MIP + z * KEY_COORDINATE + x, priority = distance / size + offset, previous = pages.get(key);
            if (!previous) pages.set(key, { key, mip, x, z, priority, distance, prefetch });
            else if (priority < previous.priority) { previous.priority = priority; previous.distance = distance; previous.prefetch = prefetch && previous.prefetch; }
            else if (!prefetch) previous.prefetch = false;
            if (mip === 0) continue;
            const footprint = orthographic ? orthoPixel * stretch(Math.abs(camera.direction.y) + slope)
                : distance * pixelAngle * stretch((distance > 0 ? Math.abs(eye.y - cy) / distance : 1) + slope);
            if (footprint * bias >= size / pageTexels) continue;
            const child = mip - 1, ex = originX[child] + window, ez = originZ[child] + window, limit = perAxis[child];
            if (top + 12 > stack.length) { const grown = new Int32Array(stack.length * 2); grown.set(stack); stack = grown; }
            for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
                const childX = x * 2 + i, childZ = z * 2 + j;
                if (childX >= originX[child] && childZ >= originZ[child] && childX < ex && childZ < ez && childX < limit && childZ < limit) {
                    stack[top++] = child; stack[top++] = childX; stack[top++] = childZ;
                }
            }
        }
    };
    descend(camera.position, camera.frustumPlanes, 0, false);
    const speed = velocity ? Math.hypot(velocity.x, velocity.y, velocity.z) : 0;
    if (velocity && speed >= DEMAND.prefetchMinimumSpeed) {
        const shift = { x: velocity.x * DEMAND.prefetchSeconds, y: velocity.y * DEMAND.prefetchSeconds, z: velocity.z * DEMAND.prefetchSeconds };
        const eye = { x: camera.position.x + shift.x, y: camera.position.y + shift.y, z: camera.position.z + shift.z };
        descend(eye, camera.frustumPlanes.map(p => ({ x: p.x, y: p.y, z: p.z, w: p.w - (p.x * shift.x + p.y * shift.y + p.z * shift.z) })), DEMAND.prefetchPriorityOffset, true);
    }
    // further prefetch views (the camera turned ahead), ranked like the motion prefetch
    for (const view of views) descend(view.position, view.frustumPlanes, DEMAND.prefetchPriorityOffset, true);
    const sorted = [...pages.values()].sort((a, b) => a.priority - b.priority || b.mip - a.mip || a.key - b.key);
    const byMip = Array.from({ length: geometry.mips }, () => 0);
    const kept = sorted.length > capacity ? sorted.slice(0, capacity) : sorted;
    for (const page of kept) byMip[page.mip]++;
    return { pages: kept, desired: sorted.length, visited, limited: sorted.length > capacity || visited >= DEMAND.maximumNodes, byMip, pruned };
}

/**
 * Feedback interface (unused by the shipped runtime): merges pages that frame feedback found missing (for example a GPU readback of the pages the
 * cached frame wanted) into a CPU plan. Requested pages and the ancestors the plan lacks are appended after the plan's own pages in request order,
 * coarse first, so feedback fills spare capacity and never displaces planned pages.
 * @param {{geometry:any,plan:{pages:Array<any>,desired:number,visited:number,limited:boolean,byMip:number[]},feedback:ReadonlyArray<{mip:number,x:number,z:number}>,capacity:number}} options
 */
export function mergeLandscapeSurfaceCacheFeedback({ geometry, plan, feedback, capacity }) {
    const keys = new Set(plan.pages.map(page => page.key)), added = [];
    let priority = plan.pages.reduce((max, page) => Math.max(max, page.priority), 0);
    for (const request of feedback) {
        landscapeSurfaceCachePageBounds(geometry, request.mip, request.x, request.z);
        const chain = [];
        for (let mip = request.mip, x = request.x, z = request.z; mip <= geometry.rootMip; mip++, x = Math.floor(x / 2), z = Math.floor(z / 2)) {
            const key = landscapeSurfaceCachePageKey(mip, x, z);
            if (keys.has(key)) break;
            keys.add(key);
            chain.push({ key, mip, x, z });
        }
        for (const page of chain.reverse()) added.push({ ...page, priority: ++priority, distance: null, prefetch: false, feedback: true });
    }
    const pages = [...plan.pages, ...added].slice(0, Math.max(capacity, plan.pages.length)), byMip = Array.from({ length: geometry.mips }, () => 0);
    for (const page of pages) byMip[page.mip]++;
    return { ...plan, pages, byMip, feedback: pages.length - plan.pages.length, limited: plan.limited || pages.length < plan.pages.length + added.length };
}
