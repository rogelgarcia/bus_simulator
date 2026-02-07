// src/graphics/visuals/static_ao/StaticAoDistanceField.js
// Computes a distance-to-buildings field on the CityMap tile grid (used for cheap static ground AO).
// @ts-check

const SQRT2 = Math.SQRT2;

class MinHeap {
    constructor() {
        /** @type {{ idx: number, d: number }[]} */
        this._items = [];
    }

    get size() {
        return this._items.length;
    }

    push(item) {
        const node = item && typeof item === 'object' ? item : null;
        if (!node) return;
        const idx = Number(node.idx);
        const d = Number(node.d);
        if (!Number.isFinite(idx) || idx < 0) return;
        if (!Number.isFinite(d) || d < 0) return;

        const arr = this._items;
        let i = arr.length;
        arr.push({ idx, d });

        while (i > 0) {
            const parent = ((i - 1) / 2) | 0;
            if (arr[parent].d <= d) break;
            arr[i] = arr[parent];
            i = parent;
        }
        arr[i] = { idx, d };
    }

    pop() {
        const arr = this._items;
        if (!arr.length) return null;
        const top = arr[0];
        const last = arr.pop();
        if (!arr.length) return top;

        const { idx, d } = last;
        const n = arr.length;
        let i = 0;
        while (true) {
            const left = i * 2 + 1;
            if (left >= n) break;
            const right = left + 1;
            const child = (right < n && arr[right].d < arr[left].d) ? right : left;
            if (arr[child].d >= d) break;
            arr[i] = arr[child];
            i = child;
        }
        arr[i] = { idx, d };
        return top;
    }
}

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeQuality(quality) {
    const raw = typeof quality === 'string' ? quality.trim().toLowerCase() : '';
    if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
    return 'medium';
}

/**
 * @typedef {object} StaticAoDistanceField
 * @property {number} version
 * @property {number} width
 * @property {number} height
 * @property {number} tileSize
 * @property {{x:number,z:number}} origin
 * @property {'low'|'medium'|'high'} quality
 * @property {Float32Array} distancesTiles
 */

/**
 * Builds a multi-source distance field (in tile units) for the nearest building tile.
 * Quality affects the neighbor set and diagonal weighting:
 * - `low`: 4-neighbor (Manhattan-ish)
 * - `medium`: 8-neighbor, diagonal cost 1
 * - `high`: 8-neighbor, diagonal cost sqrt(2)
 * @param {import('../../../app/city/CityMap.js').CityMap} map
 * @param {{quality?: 'low'|'medium'|'high'}=} options
 * @returns {StaticAoDistanceField}
 */
export function buildBuildingDistanceField(map, { quality = 'medium' } = {}) {
    const m = map && typeof map === 'object' ? map : null;
    if (!m) throw new Error('[StaticAoDistanceField] map is required');

    const width = Math.max(0, Math.floor(Number(m.width) || 0));
    const height = Math.max(0, Math.floor(Number(m.height) || 0));
    if (!width || !height) throw new Error('[StaticAoDistanceField] map dimensions must be > 0');

    const tileSize = clamp(m.tileSize, 0.0001, 1e9, 1);
    const originX = Number(m.origin?.x);
    const originZ = Number(m.origin?.z);
    if (!Number.isFinite(originX) || !Number.isFinite(originZ)) throw new Error('[StaticAoDistanceField] map origin is required');

    const q = sanitizeQuality(quality);
    const diagonalCost = q === 'high' ? SQRT2 : 1;
    const dirs = q === 'low'
        ? [
            { dx: -1, dy: 0, w: 1 },
            { dx: 1, dy: 0, w: 1 },
            { dx: 0, dy: -1, w: 1 },
            { dx: 0, dy: 1, w: 1 }
        ]
        : [
            { dx: -1, dy: 0, w: 1 },
            { dx: 1, dy: 0, w: 1 },
            { dx: 0, dy: -1, w: 1 },
            { dx: 0, dy: 1, w: 1 },
            { dx: -1, dy: -1, w: diagonalCost },
            { dx: 1, dy: -1, w: diagonalCost },
            { dx: -1, dy: 1, w: diagonalCost },
            { dx: 1, dy: 1, w: diagonalCost }
        ];

    const n = width * height;
    const distancesTiles = new Float32Array(n);
    distancesTiles.fill(Number.POSITIVE_INFINITY);

    const heap = new MinHeap();
    const buildings = Array.isArray(m.buildings) ? m.buildings : [];

    for (const building of buildings) {
        const tiles = Array.isArray(building?.tiles) ? building.tiles : [];
        for (const entry of tiles) {
            const tx = entry?.[0];
            const ty = entry?.[1];
            if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
            const x = tx | 0;
            const y = ty | 0;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const idx = x + y * width;
            if (distancesTiles[idx] <= 0) continue;
            distancesTiles[idx] = 0;
            heap.push({ idx, d: 0 });
        }
    }

    while (heap.size) {
        const node = heap.pop();
        if (!node) break;
        const idx = node.idx;
        const d = node.d;
        if (d > distancesTiles[idx] + 1e-6) continue;

        const x = idx % width;
        const y = (idx / width) | 0;

        for (const dir of dirs) {
            const nx = x + dir.dx;
            const ny = y + dir.dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nidx = nx + ny * width;
            const nd = d + dir.w;
            if (nd + 1e-6 >= distancesTiles[nidx]) continue;
            distancesTiles[nidx] = nd;
            heap.push({ idx: nidx, d: nd });
        }
    }

    return {
        version: 1,
        width,
        height,
        tileSize,
        origin: { x: originX, z: originZ },
        quality: q,
        distancesTiles
    };
}

/**
 * @param {StaticAoDistanceField} field
 * @param {number} worldX
 * @param {number} worldZ
 */
export function sampleBuildingDistanceMeters(field, worldX, worldZ) {
    const f = field && typeof field === 'object' ? field : null;
    if (!f) throw new Error('[StaticAoDistanceField] field is required');
    const x = Number(worldX);
    const z = Number(worldZ);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return Number.POSITIVE_INFINITY;

    const tx = Math.round((x - f.origin.x) / f.tileSize);
    const ty = Math.round((z - f.origin.z) / f.tileSize);
    if (tx < 0 || ty < 0 || tx >= f.width || ty >= f.height) return Number.POSITIVE_INFINITY;

    const idx = tx + ty * f.width;
    const dt = f.distancesTiles[idx];
    if (!Number.isFinite(dt)) return Number.POSITIVE_INFINITY;
    return dt * f.tileSize;
}

/**
 * Approximates distance to the nearest building footprint boundary by subtracting half a tile.
 * @param {StaticAoDistanceField} field
 * @param {number} worldX
 * @param {number} worldZ
 */
export function sampleBuildingBoundaryDistanceMeters(field, worldX, worldZ) {
    const f = field && typeof field === 'object' ? field : null;
    if (!f) throw new Error('[StaticAoDistanceField] field is required');
    const d = sampleBuildingDistanceMeters(f, worldX, worldZ);
    if (!Number.isFinite(d)) return d;
    return Math.max(0, d - f.tileSize * 0.5);
}

