// Fills depressions with Priority-Flood, resolves drainage over flats and routes multiple-flow-direction accumulation on the whole grid.
// @ts-check
// Priority-Flood (Barnes, Lehman & Mulla 2014) with a FIFO pit queue fills every closed depression to its spill level; outlets are every
// landscape-edge sample and every sample below sea level. The min-heap orders by (elevation, index), so equal elevations never depend on
// insertion order. Flats (filled samples with no lower neighbor) drain by the combined gradient of Barnes, Lehman & Mulla (2014,
// "An efficient assignment of drainage direction over flat surfaces"): twice the distance toward the flat's low edges plus the
// inverted distance away from its high edges, so water converges along the middle of a flat to its outlet instead of radiating from
// the spill point. Accumulation visits donors before receivers (filled level descending; within a level, flat samples by descending
// mask, then draining samples) and splits flow with Quinn et al. (1991) multiple flow directions: tan^p times the contour factor over
// strictly lower filled neighbors, over lower-mask flat neighbors on a flat, and over draining equal-level neighbors from a low edge.

// north, north-east, east, south-east, south, south-west, west, north-west as (row, column) steps
export const TERRAIN_NEIGHBORS = Object.freeze([[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]]);
const CONTOUR_FACTOR = Object.freeze([.5, .354, .5, .354, .5, .354, .5, .354]);

class SampleHeap {
    /** @param {import('./TerrainFieldsGrid.mjs').TerrainFieldMemory} memory @param {number} capacity */
    constructor(memory, capacity) {
        this.memory = memory;
        this.keys = memory.allocate('flood/heap-keys', Float64Array, capacity);
        this.ids = memory.allocate('flood/heap-ids', Int32Array, capacity);
        this.size = 0;
        this.peak = 0;
    }

    less(a, b) { return this.keys[a] < this.keys[b] || (this.keys[a] === this.keys[b] && this.ids[a] < this.ids[b]); }

    swap(a, b) {
        const key = this.keys[a], id = this.ids[a];
        this.keys[a] = this.keys[b]; this.ids[a] = this.ids[b];
        this.keys[b] = key; this.ids[b] = id;
    }

    push(key, id) {
        if (this.size === this.keys.length) {
            const capacity = this.keys.length * 2;
            this.keys = this.memory.grow('flood/heap-keys', this.keys, capacity);
            this.ids = this.memory.grow('flood/heap-ids', this.ids, capacity);
        }
        let at = this.size++;
        this.keys[at] = key; this.ids[at] = id;
        this.peak = Math.max(this.peak, this.size);
        while (at > 0) {
            const parent = (at - 1) >> 1;
            if (!this.less(at, parent)) break;
            this.swap(at, parent); at = parent;
        }
    }

    pop() {
        const id = this.ids[0];
        this.size--;
        if (this.size > 0) {
            this.keys[0] = this.keys[this.size]; this.ids[0] = this.ids[this.size];
            let at = 0;
            for (;;) {
                const left = at * 2 + 1, right = left + 1;
                let smallest = at;
                if (left < this.size && this.less(left, smallest)) smallest = left;
                if (right < this.size && this.less(right, smallest)) smallest = right;
                if (smallest === at) break;
                this.swap(at, smallest); at = smallest;
            }
        }
        return id;
    }

    release() { this.memory.free('flood/heap-keys', 'flood/heap-ids'); }
}

/**
 * Fills every closed depression of `levels` to its spill level and records the flood order (non-decreasing filled level).
 * @param {{columns:number,rows:number}} grid @param {Float32Array} levels routing surface @param {Uint8Array} outlet 1 where a sample drains out of the landscape
 * @param {import('./TerrainFieldsGrid.mjs').TerrainFieldMemory} memory
 * @returns {{filled:Float32Array,order:Int32Array,outlet:Uint8Array,statistics:{outlets:number,filledSamples:number,maximumFillMeters:number,heapPeak:number}}}
 */
export function priorityFlood(grid, levels, outlet, memory) {
    const { columns, rows } = grid, n = columns * rows;
    const filled = memory.allocate('flood/filled', Float32Array, n), order = memory.allocate('flood/order', Int32Array, n), closed = memory.allocate('flood/closed', Uint8Array, n);
    const pit = memory.allocate('flood/pit', Int32Array, n);
    const heap = new SampleHeap(memory, Math.max(1024, 2 * (columns + rows)));
    let outlets = 0;
    for (let i = 0; i < n; i++) if (outlet[i]) { closed[i] = 1; filled[i] = levels[i]; heap.push(levels[i], i); outlets++; }
    let head = 0, tail = 0, popped = 0, filledSamples = 0, maximumFill = 0;
    while (heap.size > 0 || head < tail) {
        const cell = head < tail ? pit[head++] : heap.pop();
        order[popped++] = cell;
        const row = (cell / columns) | 0, column = cell - row * columns, level = filled[cell];
        for (let k = 0; k < 8; k++) {
            const r = row + TERRAIN_NEIGHBORS[k][0], c = column + TERRAIN_NEIGHBORS[k][1];
            if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
            const next = r * columns + c;
            if (closed[next]) continue;
            closed[next] = 1;
            if (levels[next] <= level) {
                filled[next] = level; pit[tail++] = next;
                if (levels[next] < level) { filledSamples++; maximumFill = Math.max(maximumFill, level - levels[next]); }
            } else { filled[next] = levels[next]; heap.push(levels[next], next); }
        }
    }
    if (popped !== n) throw new Error(`[TerrainFields] Priority-Flood visited ${popped} of ${n} samples; every sample must reach an outlet`);
    const heapPeak = heap.peak;
    heap.release();
    memory.free('flood/closed', 'flood/pit');
    return { filled, order, outlet, statistics: { outlets, filledSamples, maximumFillMeters: maximumFill, heapPeak } };
}

/**
 * Barnes et al. (2014) flat resolution on the filled surface and the donor-before-receiver processing order.
 * @param {{columns:number,rows:number}} grid @param {{filled:Float32Array,order:Int32Array,outlet:Uint8Array}} flood @param {import('./TerrainFieldsGrid.mjs').TerrainFieldMemory} memory
 */
export function resolveFlats(grid, flood, memory) {
    const { columns, rows } = grid, n = columns * rows, { filled, outlet } = flood;
    const flat = memory.allocate('flats/flat', Uint8Array, n), mask = memory.allocate('flats/mask', Int32Array, n), label = memory.allocate('flats/label', Int32Array, n);
    const queue = memory.allocate('flats/queue', Int32Array, n);
    const neighbor = (cell, k) => {
        const row = (cell / columns) | 0, r = row + TERRAIN_NEIGHBORS[k][0], c = cell - row * columns + TERRAIN_NEIGHBORS[k][1];
        return r < 0 || c < 0 || r >= rows || c >= columns ? -1 : r * columns + c;
    };
    let flatSamples = 0;
    for (let i = 0; i < n; i++) {
        if (outlet[i]) continue;
        let lower = false;
        for (let k = 0; k < 8 && !lower; k++) { const j = neighbor(i, k); if (j >= 0 && filled[j] < filled[i]) lower = true; }
        if (!lower) { flat[i] = 1; flatSamples++; }
    }
    // connected flats share one filled level; label them in index order
    let labels = 0;
    for (let i = 0; i < n; i++) {
        if (!flat[i] || label[i]) continue;
        label[i] = ++labels;
        let head = 0, tail = 0;
        queue[tail++] = i;
        while (head < tail) {
            const cell = queue[head++];
            for (let k = 0; k < 8; k++) { const j = neighbor(cell, k); if (j >= 0 && flat[j] && !label[j] && filled[j] === filled[cell]) { label[j] = labels; queue[tail++] = j; } }
        }
    }
    const height = memory.allocate('flats/height', Int32Array, labels + 1), away = memory.allocate('flats/away', Int32Array, n);
    // breadth-first distances from high edges (away from higher) and from low edges (toward lower), confined to each flat
    const bfs = (seed, distance, track) => {
        let head = 0, tail = 0;
        for (let i = 0; i < n; i++) if (flat[i] && seed(i)) { distance[i] = 1; queue[tail++] = i; }
        while (head < tail) {
            const cell = queue[head++];
            if (track) height[label[cell]] = Math.max(height[label[cell]], distance[cell]);
            for (let k = 0; k < 8; k++) { const j = neighbor(cell, k); if (j >= 0 && flat[j] && !distance[j] && label[j] === label[cell]) { distance[j] = distance[cell] + 1; queue[tail++] = j; } }
        }
    };
    const highEdge = i => { for (let k = 0; k < 8; k++) { const j = neighbor(i, k); if (j >= 0 && filled[j] > filled[i]) return true; } return false; };
    const lowEdge = i => { for (let k = 0; k < 8; k++) { const j = neighbor(i, k); if (j >= 0 && !flat[j] && filled[j] === filled[i]) return true; } return false; };
    bfs(highEdge, away, true);
    bfs(lowEdge, mask, false);
    let undrained = 0;
    for (let i = 0; i < n; i++) {
        if (!flat[i]) continue;
        if (!mask[i]) { undrained++; continue; }
        mask[i] = 2 * mask[i] + (away[i] ? height[label[i]] - away[i] : 0);
    }
    memory.free('flats/away', 'flats/height', 'flats/label');
    // processing order: flood order reversed by level groups; inside a group flat samples by descending mask, then draining samples
    const processing = memory.allocate('flats/processing', Int32Array, n), order = flood.order;
    let at = 0;
    for (let start = n - 1; start >= 0;) {
        let end = start;
        while (end > 0 && filled[order[end - 1]] === filled[order[start]]) end--;
        let count = 0;
        for (let k = end; k <= start; k++) if (flat[order[k]]) queue[count++] = order[k];
        const group = queue.subarray(0, count).sort((a, b) => mask[b] - mask[a] || a - b);
        for (let k = 0; k < count; k++) processing[at++] = group[k];
        for (let k = start; k >= end; k--) if (!flat[order[k]]) processing[at++] = order[k];
        start = end - 1;
    }
    memory.free('flats/queue');
    return { flat, mask, processing, statistics: { flatSamples, flats: labels, undrainedFlatSamples: undrained } };
}

/**
 * Multiple-flow-direction contributing area (square meters, including each sample's own cell). Outlets keep their inflow.
 * @param {{columns:number,rows:number,spacingX:number,spacingZ:number}} grid @param {{filled:Float32Array,outlet:Uint8Array}} flood
 * @param {{flat:Uint8Array,mask:Int32Array,processing:Int32Array}} flats @param {number} exponent @param {import('./TerrainFieldsGrid.mjs').TerrainFieldMemory} memory
 */
export function flowAccumulation(grid, flood, flats, exponent, memory) {
    const { columns, rows, spacingX, spacingZ } = grid, n = columns * rows, cellArea = spacingX * spacingZ, { filled, outlet } = flood, { flat, mask, processing } = flats;
    const area = memory.allocate('flow/area', Float64Array, n);
    const distance = TERRAIN_NEIGHBORS.map(([dr, dc]) => Math.hypot(dr * spacingZ, dc * spacingX));
    const weights = new Float64Array(8), targets = new Int32Array(8);
    area.fill(cellArea);
    let mfdSamples = 0, flatInterior = 0, lowEdges = 0, stranded = 0;
    for (let k = 0; k < n; k++) {
        const cell = processing[k];
        if (outlet[cell]) continue;
        const row = (cell / columns) | 0, column = cell - row * columns, level = filled[cell];
        let total = 0, kind = 0;
        for (let j = 0; j < 8; j++) {
            weights[j] = 0; targets[j] = -1;
            const r = row + TERRAIN_NEIGHBORS[j][0], c = column + TERRAIN_NEIGHBORS[j][1];
            if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
            targets[j] = r * columns + c;
        }
        if (!flat[cell]) {
            for (let j = 0; j < 8; j++) {
                const target = targets[j];
                if (target < 0 || filled[target] >= level) continue;
                weights[j] = Math.pow((level - filled[target]) / distance[j], exponent) * CONTOUR_FACTOR[j];
                total += weights[j];
            }
            kind = 1;
        } else {
            for (let j = 0; j < 8; j++) {
                const target = targets[j];
                if (target >= 0 && !flat[target] && filled[target] === level) { weights[j] = CONTOUR_FACTOR[j] / distance[j]; total += weights[j]; }
            }
            if (total > 0) kind = 2;
            else {
                for (let j = 0; j < 8; j++) {
                    const target = targets[j];
                    if (target < 0 || !flat[target] || filled[target] !== level || mask[target] >= mask[cell]) continue;
                    weights[j] = Math.pow((mask[cell] - mask[target]) / distance[j], exponent) * CONTOUR_FACTOR[j];
                    total += weights[j];
                }
                kind = 3;
            }
        }
        if (total <= 0) { stranded++; continue; }
        if (kind === 1) mfdSamples++; else if (kind === 2) lowEdges++; else flatInterior++;
        const amount = area[cell];
        for (let j = 0; j < 8; j++) if (weights[j] > 0) area[targets[j]] += amount * weights[j] / total;
    }
    if (stranded) throw new Error(`[TerrainFields] ${stranded} samples have no drainage after flat resolution`);
    return { area, statistics: { mfdSamples, flatInteriorSamples: flatInterior, lowEdgeSamples: lowEdges, exponent, cellArea } };
}
