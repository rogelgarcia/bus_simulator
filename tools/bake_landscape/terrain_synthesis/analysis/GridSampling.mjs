// Samples grids bilinearly, rasterizes plan polygons, resamples polylines and ranks percentiles for the terrain measurements.
// @ts-check
// Every measurement module shares one convention: world x = minX + column * spacingX, z = maxZ - row * spacingZ, continuous positions
// are clamped to the grid and interpolated bilinearly (the planning generator's map_coordinates(order=1, mode='nearest')), categorical
// rasters are read at the nearest sample, polygons select the sample positions strictly inside them by the even-odd rule, and percentiles
// are the nearest-rank-below of a sorted float64 copy (the terrain-fields convention), so repeated runs are bit identical.
import { terrainGradient } from '../../terrain_fields/TerrainFieldsGrid.mjs';

/** @typedef {{columns:number,rows:number,spacingX:number,spacingZ:number,minX:number,maxZ:number}} SynthesisGrid */

const DEGREES = 180 / Math.PI;

/** @param {SynthesisGrid} grid */
export function assertSynthesisGrid(grid, heights, cover) {
    if (!grid || !Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) || grid.columns < 3 || grid.rows < 3) throw new Error('[SynthesisAnalysis] Grid needs integer columns/rows of at least 3');
    for (const key of ['spacingX', 'spacingZ', 'minX', 'maxZ']) if (!Number.isFinite(grid[key])) throw new Error(`[SynthesisAnalysis] grid.${key} must be finite`);
    if (!(grid.spacingX > 0) || !(grid.spacingZ > 0)) throw new Error('[SynthesisAnalysis] Grid spacing must be positive');
    if (!(heights instanceof Float32Array) || heights.length !== grid.columns * grid.rows) throw new Error('[SynthesisAnalysis] heights must be a Float32Array of columns*rows samples');
    if (cover !== undefined && (!(cover instanceof Uint8Array) || cover.length !== heights.length)) throw new Error('[SynthesisAnalysis] cover must be a Uint8Array of columns*rows samples');
}

/** @param {SynthesisGrid} grid @param {number} x */
export const gridColumnOf = (grid, x) => (x - grid.minX) / grid.spacingX;
/** @param {SynthesisGrid} grid @param {number} z */
export const gridRowOf = (grid, z) => (grid.maxZ - z) / grid.spacingZ;
/** @param {SynthesisGrid} grid @param {number} column */
export const worldXOf = (grid, column) => grid.minX + column * grid.spacingX;
/** @param {SynthesisGrid} grid @param {number} row */
export const worldZOf = (grid, row) => grid.maxZ - row * grid.spacingZ;

/** Bilinear sample of a scalar raster at a world position (clamped to the grid). @param {SynthesisGrid} grid @param {ArrayLike<number>} values */
export function sampleBilinear(grid, values, x, z) {
    const fc = Math.min(Math.max(gridColumnOf(grid, x), 0), grid.columns - 1), fr = Math.min(Math.max(gridRowOf(grid, z), 0), grid.rows - 1);
    const c0 = Math.min(grid.columns - 2, Math.floor(fc)), r0 = Math.min(grid.rows - 2, Math.floor(fr)), u = fc - c0, v = fr - r0, i = r0 * grid.columns + c0;
    const a = values[i], b = values[i + 1], c = values[i + grid.columns], d = values[i + grid.columns + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Nearest-sample read of a categorical raster at a world position (clamped). @param {SynthesisGrid} grid @param {ArrayLike<number>} values */
export function sampleNearest(grid, values, x, z) {
    const column = Math.min(Math.max(Math.round(gridColumnOf(grid, x)), 0), grid.columns - 1), row = Math.min(Math.max(Math.round(gridRowOf(grid, z)), 0), grid.rows - 1);
    return values[row * grid.columns + column];
}

/** Terrain slope in degrees from central differences (one-sided at the landscape edge). @param {SynthesisGrid} grid @param {Float32Array} heights @param {import('../../terrain_fields/TerrainFieldsGrid.mjs').TerrainFieldMemory} memory */
export function slopeDegreesRaster(grid, heights, memory, name = 'slope') {
    const { dhdx, dhdz } = terrainGradient(grid, heights, memory, `${name}/`), slope = memory.allocate(name, Float32Array, heights.length);
    for (let i = 0; i < heights.length; i++) slope[i] = Math.atan(Math.hypot(dhdx[i], dhdz[i])) * DEGREES;
    memory.free(`${name}/dhdx`, `${name}/dhdz`);
    return slope;
}

/**
 * The native samples of a world window (its edges must lie on native vertices) as their own grid, optionally with a halo of extra samples
 * clamped at the landscape edge, so a renderer or a fit works on one fixed world window at every spacing without resampling.
 * @param {SynthesisGrid} grid @param {Float32Array|Float64Array|Uint8Array} values @param {{minX:number,maxX:number,minZ:number,maxZ:number}} window
 * @param {{halo?:number}} [options]
 */
export function extractGridWindow(grid, values, window, { halo = 0 } = {}) {
    if (!window || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(window[key])) || !Number.isInteger(halo) || halo < 0) throw new Error('[SynthesisAnalysis] extractGridWindow needs a finite window and a non-negative integer halo');
    const column0 = Math.round(gridColumnOf(grid, window.minX)), column1 = Math.round(gridColumnOf(grid, window.maxX)), row0 = Math.round(gridRowOf(grid, window.maxZ)), row1 = Math.round(gridRowOf(grid, window.minZ));
    for (const [actual, wanted, label] of [[worldXOf(grid, column0), window.minX, 'minX'], [worldXOf(grid, column1), window.maxX, 'maxX'], [worldZOf(grid, row0), window.maxZ, 'maxZ'], [worldZOf(grid, row1), window.minZ, 'minZ']]) {
        if (Math.abs(actual - wanted) > 1e-6) throw new Error(`[SynthesisAnalysis] window ${label} = ${wanted} is not on a native vertex of the ${grid.spacingX} m grid (nearest ${actual})`);
    }
    if (column0 < 0 || row0 < 0 || column1 >= grid.columns || row1 >= grid.rows || column1 <= column0 || row1 <= row0) throw new Error('[SynthesisAnalysis] window must lie inside the grid with a positive extent');
    const c0 = Math.max(0, column0 - halo), c1 = Math.min(grid.columns - 1, column1 + halo), r0 = Math.max(0, row0 - halo), r1 = Math.min(grid.rows - 1, row1 + halo);
    const columns = c1 - c0 + 1, rows = r1 - r0 + 1, Type = /** @type {any} */ (values.constructor), output = new Type(columns * rows);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) output[row * columns + column] = values[(r0 + row) * grid.columns + c0 + column];
    return { grid: { columns, rows, spacingX: grid.spacingX, spacingZ: grid.spacingZ, minX: worldXOf(grid, c0), maxZ: worldZOf(grid, r0) }, values: output, origin: { column: c0, row: r0 },
        halo: { west: column0 - c0, north: row0 - r0, east: c1 - column1, south: r1 - row1 } };
}

/** Even-odd point-in-polygon test. @param {ArrayLike<ArrayLike<number>>} polygon [x,z] vertices */
export function pointInPolygon(polygon, x, z) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], zi = polygon[i][1], xj = polygon[j][0], zj = polygon[j][1];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

/** @param {ArrayLike<ArrayLike<number>>} polygon */
export function assertPolygon(polygon, label) {
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some(point => !Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) throw new Error(`[SynthesisAnalysis] ${label} must be a polygon of at least three finite [x, z] vertices`);
}

/** Sample indices (ascending) whose positions fall inside the polygon. @param {SynthesisGrid} grid @param {ArrayLike<ArrayLike<number>>} polygon */
export function polygonSampleIndices(grid, polygon) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of polygon) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const c0 = Math.max(0, Math.ceil(gridColumnOf(grid, minX))), c1 = Math.min(grid.columns - 1, Math.floor(gridColumnOf(grid, maxX)));
    const r0 = Math.max(0, Math.ceil(gridRowOf(grid, maxZ))), r1 = Math.min(grid.rows - 1, Math.floor(gridRowOf(grid, minZ)));
    const indices = [];
    for (let row = r0; row <= r1; row++) {
        const z = worldZOf(grid, row);
        for (let column = c0; column <= c1; column++) if (pointInPolygon(polygon, worldXOf(grid, column), z)) indices.push(row * grid.columns + column);
    }
    return Int32Array.from(indices);
}

/** Area-weighted centroid of a simple polygon. @param {ArrayLike<ArrayLike<number>>} polygon */
export function polygonCentroid(polygon) {
    let area = 0, cx = 0, cz = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const cross = polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
        area += cross; cx += (polygon[j][0] + polygon[i][0]) * cross; cz += (polygon[j][1] + polygon[i][1]) * cross;
    }
    if (area === 0) throw new Error('[SynthesisAnalysis] Polygon has zero area');
    return { x: cx / (3 * area), z: cz / (3 * area), area: Math.abs(area) / 2 };
}

/**
 * Arc-length parametrization of an [x,z] polyline with evaluation at any distance and resampling at a fixed station step (the end is
 * always included). Consecutive duplicate vertices are dropped.
 * @param {ArrayLike<ArrayLike<number>>} points
 */
export function polylinePath(points, label = 'polyline') {
    const xs = [], zs = [];
    for (const point of points) {
        if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) throw new Error(`[SynthesisAnalysis] ${label} has a non-finite vertex`);
        const n = xs.length;
        if (n && Math.hypot(point[0] - xs[n - 1], point[1] - zs[n - 1]) < 1e-9) continue;
        xs.push(point[0]); zs.push(point[1]);
    }
    if (xs.length < 2) throw new Error(`[SynthesisAnalysis] ${label} needs at least two distinct vertices`);
    const cumulative = new Float64Array(xs.length);
    for (let i = 1; i < xs.length; i++) cumulative[i] = cumulative[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    const length = cumulative[xs.length - 1];
    const pointAt = s => {
        const t = Math.min(Math.max(s, 0), length);
        let low = 0, high = xs.length - 1;
        while (high - low > 1) { const middle = (low + high) >> 1; if (cumulative[middle] <= t) low = middle; else high = middle; }
        const span = cumulative[high] - cumulative[low], f = span > 0 ? (t - cumulative[low]) / span : 0;
        return { x: xs[low] + (xs[high] - xs[low]) * f, z: zs[low] + (zs[high] - zs[low]) * f };
    };
    const stations = step => {
        if (!(step > 0)) throw new Error(`[SynthesisAnalysis] ${label} station step must be positive`);
        const count = Math.floor(length / step) + 1, extra = length - (count - 1) * step > 1e-9 ? 1 : 0;
        const distance = new Float64Array(count + extra), x = new Float64Array(count + extra), z = new Float64Array(count + extra);
        for (let i = 0; i < count + extra; i++) {
            distance[i] = i < count ? i * step : length;
            const point = pointAt(distance[i]); x[i] = point.x; z[i] = point.z;
        }
        return { distance, x, z };
    };
    return { x: xs, z: zs, cumulative, length, pointAt, stations };
}

/** Nearest-rank-below percentiles of a float64 copy of `values` (sorted in place). @param {Float64Array} sorted @param {number[]} percentiles */
export function percentilesOfSorted(sorted, percentiles) {
    const count = sorted.length;
    return Object.fromEntries(percentiles.map(p => [`p${p}`, count ? sorted[Math.min(count - 1, Math.max(0, Math.floor(p / 100 * (count - 1))))] : null]));
}

/** @param {Float64Array} sorted */
export function summaryOfSorted(sorted, percentiles = [50, 90, 99]) {
    const count = sorted.length;
    let sum = 0;
    for (let i = 0; i < count; i++) sum += sorted[i];
    return { count, mean: count ? sum / count : null, min: count ? sorted[0] : null, max: count ? sorted[count - 1] : null, ...percentilesOfSorted(sorted, percentiles) };
}

/** Collects the raster values selected by `include` into a sorted float64 array. @param {ArrayLike<number>} values @param {(index:number)=>boolean} include */
export function sortedSelection(values, include) {
    let count = 0;
    for (let i = 0; i < values.length; i++) if (include(i)) count++;
    const sorted = new Float64Array(count);
    let at = 0;
    for (let i = 0; i < values.length; i++) if (include(i)) sorted[at++] = values[i];
    sorted.sort();
    return sorted;
}

/** Signed slope in degrees along a sampled profile (central differences, one-sided at the ends). @param {ArrayLike<number>} distance @param {ArrayLike<number>} height */
export function profileSlopeDegrees(distance, height) {
    const n = distance.length, slope = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), run = distance[b] - distance[a];
        slope[i] = run > 0 ? Math.atan((height[b] - height[a]) / run) * DEGREES : 0;
    }
    return slope;
}

/** Linear interpolation of the design shoreline X at a given Z (polyline ordered by Z). @param {ArrayLike<ArrayLike<number>>} pointsXYZ */
export function shorelineXAt(pointsXYZ, z) {
    let best = null;
    for (let i = 1; i < pointsXYZ.length; i++) {
        const z0 = pointsXYZ[i - 1][2], z1 = pointsXYZ[i][2];
        if ((z0 - z) * (z1 - z) <= 0 && z0 !== z1) {
            const t = (z - z0) / (z1 - z0), x = pointsXYZ[i - 1][0] + (pointsXYZ[i][0] - pointsXYZ[i - 1][0]) * t;
            if (best === null) best = x;
        }
    }
    if (best === null) throw new Error(`[SynthesisAnalysis] The design shoreline does not span Z = ${z}`);
    return best;
}
