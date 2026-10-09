// Measures slope distribution, windowed local relief, surface curvature and drainage incision of a terrain grid.
// @ts-check
// Natural land is cover 1..4 at or above sea level; all land is every sample at or above sea level. Slope is atan(|grad h|) from the
// central differences the mesh normals use. Local relief is max - min of height in a square window, computed with separable van Herk /
// Gil-Werman running extremes (O(n), padded with +/-Infinity so landscape-edge windows truncate). Curvature follows Zevenbergen & Thorne
// (1987) on a Gaussian-smoothed surface with the sign convention "positive = convex" for both profile (along the slope line) and plan
// (across it, i.e. the ZT plan curvature negated). Incision reuses the terrain-fields hydrology (Priority-Flood, flats, Quinn MFD) with
// outlets at the landscape edge and below sea level, and measures the local ridge (running maximum over the ridge window) above every
// channel sample. All arithmetic is float64 in a fixed visitation order.
import { TerrainFieldMemory, gaussianSmooth } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { TERRAIN_NEIGHBORS, flowAccumulation, priorityFlood, resolveFlats } from '../../terrain_fields/TerrainFieldsHydrology.mjs';
import { assertSynthesisGrid, slopeDegreesRaster, sortedSelection, summaryOfSorted } from './GridSampling.mjs';

export const NATURAL_COVER_CLASSES = Object.freeze([1, 2, 3, 4]);
export const SLOPE_BIN_EDGES_DEGREES = Object.freeze([0, 2, 5, 10, 15, 20, 30, 45]);
export const DEFAULT_WORKING_LIMIT_BYTES = 1536 * 1024 * 1024;

const memoryOf = options => new TerrainFieldMemory(options.workingLimitBytes ?? DEFAULT_WORKING_LIMIT_BYTES);
const classSet = classes => { const set = new Uint8Array(256); for (const id of classes) { if (!Number.isInteger(id) || id < 0 || id > 255) throw new Error(`[SynthesisAnalysis] Invalid cover class ${id}`); set[id] = 1; } return set; };

/** @param {{columns:number,rows:number}} grid @param {Float32Array} heights @param {Uint8Array} cover @param {number} seaLevel @param {ArrayLike<number>} classes */
export function naturalLandMask(grid, heights, cover, seaLevel, classes = NATURAL_COVER_CLASSES) {
    const natural = classSet(classes), mask = new Uint8Array(heights.length);
    for (let i = 0; i < heights.length; i++) mask[i] = natural[cover[i]] && heights[i] >= seaLevel ? 1 : 0;
    return mask;
}

/**
 * Running maximum (greater = true) or minimum over a centered window of 2*radius+1 samples along both axes.
 * @param {{columns:number,rows:number}} grid @param {ArrayLike<number>} values @param {number} radius @param {boolean} greater @param {Float32Array|Float64Array} output
 */
export function runningWindowExtreme(grid, values, radius, greater, output) {
    if (!Number.isInteger(radius) || radius < 0) throw new Error('[SynthesisAnalysis] Window radius must be a non-negative integer');
    const { columns, rows } = grid, n = columns * rows, fill = greater ? -Infinity : Infinity, k = 2 * radius + 1;
    const longest = Math.max(columns, rows) + 2 * radius, pad = new Float64Array(longest), g = new Float64Array(longest), h = new Float64Array(longest), line = new Float64Array(Math.max(columns, rows));
    const ext = greater ? (a, b) => (a > b ? a : b) : (a, b) => (a < b ? a : b);
    const pass = (length, write) => {
        const m = length + 2 * radius;
        for (let j = 0; j < m; j++) pad[j] = j < radius || j >= length + radius ? fill : line[j - radius];
        for (let j = 0; j < m; j++) g[j] = j % k === 0 ? pad[j] : ext(g[j - 1], pad[j]);
        for (let j = m - 1; j >= 0; j--) h[j] = j % k === k - 1 || j === m - 1 ? pad[j] : ext(h[j + 1], pad[j]);
        for (let i = 0; i < length; i++) write(i, ext(h[i], g[i + 2 * radius]));
    };
    for (let i = 0; i < n; i++) output[i] = values[i];
    for (let row = 0; row < rows; row++) {
        const base = row * columns;
        for (let c = 0; c < columns; c++) line[c] = output[base + c];
        pass(columns, (c, value) => { output[base + c] = value; });
    }
    for (let column = 0; column < columns; column++) {
        for (let r = 0; r < rows; r++) line[r] = output[r * columns + column];
        pass(rows, (r, value) => { output[r * columns + column] = value; });
    }
    return output;
}

/**
 * Slope histogram and percentiles over natural land and over all land.
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover
 * @param {{classes?:number[],seaLevel?:number,binEdgesDegrees?:number[],workingLimitBytes?:number}} [options]
 */
export function slopeStatistics(grid, heights, cover, options = {}) {
    assertSynthesisGrid(grid, heights, cover);
    const { classes = NATURAL_COVER_CLASSES, seaLevel = 0, binEdgesDegrees = SLOPE_BIN_EDGES_DEGREES } = options;
    if (!Number.isFinite(seaLevel)) throw new Error('[SynthesisAnalysis] seaLevel must be finite');
    const memory = memoryOf(options), slope = slopeDegreesRaster(grid, heights, memory), natural = naturalLandMask(grid, heights, cover, seaLevel, classes);
    const edges = [...binEdgesDegrees], bins = edges.map((from, i) => ({ from, to: i + 1 < edges.length ? edges[i + 1] : null, label: i + 1 < edges.length ? `${from}-${edges[i + 1]}` : `${from}+` }));
    const binOf = value => { let b = 0; while (b + 1 < edges.length && value >= edges[b + 1]) b++; return b; };
    const describe = include => {
        const counts = new Array(bins.length).fill(0);
        let count = 0, atLeast20 = 0, atLeast30 = 0;
        for (let i = 0; i < slope.length; i++) {
            if (!include(i)) continue;
            count++; counts[binOf(slope[i])]++;
            if (slope[i] >= 20) atLeast20++;
            if (slope[i] >= 30) atLeast30++;
        }
        const sorted = sortedSelection(slope, include), summary = summaryOfSorted(sorted, [50, 90, 99, 100]);
        return { count, counts, fractions: counts.map(value => (count ? value / count : 0)), mean: summary.mean, percentiles: { p50: summary.p50, p90: summary.p90, p99: summary.p99, p100: summary.p100 },
            atLeast20Degrees: { count: atLeast20, fraction: count ? atLeast20 / count : 0 }, atLeast30Degrees: { count: atLeast30, fraction: count ? atLeast30 / count : 0 } };
    };
    const result = { method: 'atan(|central-difference gradient|), nearest-rank-below percentiles', seaLevel, classes: [...classes], bins, samples: slope.length,
        natural: describe(i => natural[i] === 1), land: describe(i => heights[i] >= seaLevel) };
    memory.free('slope');
    return result;
}

/**
 * Local relief (window max - min of height) statistics over natural land plus the relief rasters.
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover
 * @param {{windowsMeters?:number[],classes?:number[],seaLevel?:number}} [options]
 * @returns {{method:string,windows:{meters:number,radiusSamples:number,windowSamples:number,windowMeters:number,natural:object,raster:Float32Array}[]}}
 */
export function localRelief(grid, heights, cover, options = {}) {
    assertSynthesisGrid(grid, heights, cover);
    const { windowsMeters = [100, 500], classes = NATURAL_COVER_CLASSES, seaLevel = 0 } = options;
    if (!Array.isArray(windowsMeters) || !windowsMeters.length || windowsMeters.some(value => !(value > 0))) throw new Error('[SynthesisAnalysis] windowsMeters must list positive window sizes');
    const natural = naturalLandMask(grid, heights, cover, seaLevel, classes), spacing = grid.spacingX;
    const maximum = new Float64Array(heights.length), minimum = new Float64Array(heights.length);
    const windows = windowsMeters.map(meters => {
        const radiusSamples = Math.max(1, Math.round(meters / spacing / 2)), windowSamples = 2 * radiusSamples + 1;
        runningWindowExtreme(grid, heights, radiusSamples, true, maximum);
        runningWindowExtreme(grid, heights, radiusSamples, false, minimum);
        const raster = new Float32Array(heights.length);
        for (let i = 0; i < heights.length; i++) raster[i] = maximum[i] - minimum[i];
        const summary = summaryOfSorted(sortedSelection(raster, i => natural[i] === 1), [50, 90, 99]);
        return { meters, radiusSamples, windowSamples, windowMeters: windowSamples * spacing, natural: { count: summary.count, mean: summary.mean, p50: summary.p50, p90: summary.p90, p99: summary.p99, max: summary.max }, raster };
    });
    return { method: 'square-window max - min of height, separable van Herk/Gil-Werman running extremes, truncated at the landscape edge', windows };
}

/**
 * Profile and plan curvature percentiles and extremes on natural land (Zevenbergen-Thorne on a smoothed surface, positive = convex).
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover
 * @param {{sigmaSamples?:number,classes?:number[],seaLevel?:number,workingLimitBytes?:number}} [options]
 */
export function curvatureExtremes(grid, heights, cover, options = {}) {
    assertSynthesisGrid(grid, heights, cover);
    const { sigmaSamples = 2, classes = NATURAL_COVER_CLASSES, seaLevel = 0 } = options;
    if (!(sigmaSamples >= 0)) throw new Error('[SynthesisAnalysis] sigmaSamples must be non-negative');
    if (grid.spacingX !== grid.spacingZ) throw new Error('[SynthesisAnalysis] Curvature requires square spacing');
    const memory = memoryOf(options), { columns, rows, spacingX: L } = grid, n = columns * rows;
    const smoothed = sigmaSamples > 0 ? gaussianSmooth(grid, heights, sigmaSamples, memory, 'curvature/smoothed') : heights;
    const natural = naturalLandMask(grid, heights, cover, seaLevel, classes);
    const profile = new Float64Array(n), plan = new Float64Array(n), valid = new Uint8Array(n);
    let flat = 0;
    for (let row = 1; row < rows - 1; row++) for (let column = 1; column < columns - 1; column++) {
        const i = row * columns + column;
        if (!natural[i]) continue;
        const z1 = smoothed[i - columns - 1], z2 = smoothed[i - columns], z3 = smoothed[i - columns + 1], z4 = smoothed[i - 1], z5 = smoothed[i], z6 = smoothed[i + 1];
        const z7 = smoothed[i + columns - 1], z8 = smoothed[i + columns], z9 = smoothed[i + columns + 1];
        const D = ((z4 + z6) / 2 - z5) / (L * L), E = ((z2 + z8) / 2 - z5) / (L * L), F = (-z1 + z3 + z7 - z9) / (4 * L * L), G = (-z4 + z6) / (2 * L), H = (z2 - z8) / (2 * L);
        const g2 = G * G + H * H;
        valid[i] = 1;
        if (g2 < 1e-12) { flat++; continue; }
        profile[i] = -2 * (D * G * G + E * H * H + F * G * H) / g2;
        plan[i] = -2 * (D * H * H + E * G * G - F * G * H) / g2;
    }
    if (sigmaSamples > 0) memory.free('curvature/smoothed');
    const describe = values => { const sorted = sortedSelection(values, i => valid[i] === 1), summary = summaryOfSorted(sorted, [1, 50, 99]); return { count: summary.count, p1: summary.p1, p50: summary.p50, p99: summary.p99, min: summary.min, max: summary.max }; };
    return { method: 'Zevenbergen-Thorne 1987 on a Gaussian-smoothed surface; units 1/m; positive = convex (profile along the slope line, plan across it); flat samples (|grad| < 1e-6) report 0', sigmaSamples, flatSamples: flat, profile: describe(profile), plan: describe(plan) };
}

/**
 * Channel network and incision from Priority-Flood/MFD accumulation over the grid.
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover @param {number} seaLevel
 * @param {{channelAreaM2?:number,ridgeWindowMeters?:number,exponent?:number,conditioningSamples?:number,workingLimitBytes?:number}} [options]
 */
export function drainageIncision(grid, heights, cover, seaLevel, options = {}) {
    assertSynthesisGrid(grid, heights, cover);
    if (!Number.isFinite(seaLevel)) throw new Error('[SynthesisAnalysis] seaLevel must be finite');
    const { channelAreaM2 = 20000, ridgeWindowMeters = 60, exponent = 1.1, conditioningSamples = 0 } = options;
    if (!(channelAreaM2 > 0) || !(ridgeWindowMeters > 0) || !(exponent > 0) || !(conditioningSamples >= 0)) throw new Error('[SynthesisAnalysis] Incision options must be positive');
    const memory = memoryOf(options), { columns, rows, spacingX, spacingZ } = grid, n = columns * rows;
    let levels = heights;
    if (conditioningSamples > 0) {
        const conditioned = gaussianSmooth(grid, heights, conditioningSamples, memory, 'incision/conditioned');
        levels = memory.allocate('incision/levels', Float32Array, n);
        for (let i = 0; i < n; i++) levels[i] = conditioned[i];
        memory.free('incision/conditioned');
    }
    const outlet = memory.allocate('incision/outlet', Uint8Array, n);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        outlet[i] = row === 0 || column === 0 || row === rows - 1 || column === columns - 1 || heights[i] < seaLevel ? 1 : 0;
    }
    const flood = priorityFlood(grid, levels, outlet, memory), flats = resolveFlats(grid, flood, memory), flow = flowAccumulation(grid, flood, flats, exponent, memory);
    const area = flow.area, channel = new Uint8Array(n);
    let channelSamples = 0, maximumArea = 0;
    for (let i = 0; i < n; i++) {
        if (area[i] > maximumArea) maximumArea = area[i];
        if (heights[i] >= seaLevel && area[i] >= channelAreaM2) { channel[i] = 1; channelSamples++; }
    }
    const radius = Math.max(1, Math.round(ridgeWindowMeters / spacingX / 2)), ridge = runningWindowExtreme(grid, heights, radius, true, new Float64Array(n));
    const incision = new Float64Array(channelSamples), byCover = {};
    let at = 0;
    for (let i = 0; i < n; i++) if (channel[i]) { incision[at++] = ridge[i] - heights[i]; byCover[cover[i]] = (byCover[cover[i]] ?? 0) + 1; }
    incision.sort();
    // 8-connected components of channel samples
    const label = new Int32Array(n), stack = new Int32Array(channelSamples || 1);
    let networks = 0, largest = 0;
    for (let seed = 0; seed < n; seed++) {
        if (!channel[seed] || label[seed]) continue;
        networks++;
        let top = 0, size = 0;
        stack[top++] = seed; label[seed] = networks;
        while (top) {
            const cell = stack[--top], row = (cell / columns) | 0, column = cell - row * columns;
            size++;
            for (let k = 0; k < 8; k++) {
                const r = row + TERRAIN_NEIGHBORS[k][0], c = column + TERRAIN_NEIGHBORS[k][1];
                if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
                const next = r * columns + c;
                if (channel[next] && !label[next]) { label[next] = networks; stack[top++] = next; }
            }
        }
        largest = Math.max(largest, size);
    }
    const summary = summaryOfSorted(incision, [50, 90]);
    memory.free('flood/filled', 'flood/order', 'flats/flat', 'flats/mask', 'flats/processing', 'flow/area', 'incision/outlet');
    if (conditioningSamples > 0) memory.free('incision/levels');
    return { method: 'Priority-Flood + Barnes flats + Quinn MFD (terrain-fields hydrology); channels = land samples with contributing area >= threshold; incision = running max of height over the ridge window minus the channel height',
        channelAreaM2, ridgeWindowMeters, ridgeWindowSamples: 2 * radius + 1, exponent, conditioningSamples, seaLevel,
        channelSamples, channelLengthMeters: channelSamples * spacingX, channelFractionOfSamples: channelSamples / n, networks, largestNetworkSamples: largest, channelSamplesByCover: byCover,
        incision: { mean: summary.mean, p50: summary.p50, p90: summary.p90, max: summary.max },
        contributingArea: { maximumM2: maximumArea, cellAreaM2: spacingX * spacingZ },
        depressions: { outlets: flood.statistics.outlets, filledSamples: flood.statistics.filledSamples, maximumFillMeters: flood.statistics.maximumFillMeters },
        flats: { flatSamples: flats.statistics.flatSamples, flats: flats.statistics.flats, undrainedFlatSamples: flats.statistics.undrainedFlatSamples } };
}
