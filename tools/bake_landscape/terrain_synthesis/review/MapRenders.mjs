// Renders hillshade, slope, local relief, hypsometric elevation and land-cover review maps of a terrain grid as 8-bit RGB images.
// @ts-check
// Shading is computed per native sample (central-difference normals, light from azimuth clockwise from north at the given altitude)
// and then area-averaged to the output size, so fine relief is integrated rather than aliased; categorical cover is resampled nearest.
// Every map carries a legend strip with the embedded font, uses fixed color ramps (slope bins match SLOPE_BIN_EDGES_DEGREES; the
// hypsometric stops are the plan's topographic map colors so renders compare directly with it) and is bit-identical across runs.
import { LANDSCAPE_LAND_COVER_CATALOG } from '../../../../src/app/landscape/LandscapeCatalog.js';
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { assertSynthesisGrid, extractGridWindow, slopeDegreesRaster } from '../analysis/GridSampling.mjs';
import { DEFAULT_WORKING_LIMIT_BYTES, SLOPE_BIN_EDGES_DEGREES } from '../analysis/ReliefMeasures.mjs';
import { createCanvas, drawText, fillRect, mixRgb, rgbOf, textWidth } from './RasterCanvas.mjs';

const RADIANS = Math.PI / 180;
export const LEGEND_HEIGHT = 44;
export const SLOPE_COLORS = Object.freeze(['#f7f7f2', '#fff2b3', '#ffd166', '#ff9f43', '#ff6b35', '#d7263d', '#7b2cbf', '#1b1b1b'].map(rgbOf));
export const RELIEF_RAMP = Object.freeze(['#1a1a4b', '#2b6ca3', '#3fbf8f', '#f5e663', '#d62728'].map(rgbOf));
export const HYPSOMETRIC_STOPS = Object.freeze([[-30, '#1c526f'], [-1, '#9ed0ce'], [0, '#efe0b5'], [5, '#d8d8a0'], [18, '#aac498'], [30, '#729d83'], [40, '#b8b38a'], [60, '#d2b192'], [160, '#f1efe8']].map(([h, c]) => [h, rgbOf(/** @type {string} */ (c))]));
const WATER_TINT = rgbOf('#9db4d2'), CONTOUR = rgbOf('#5a4a2c'), SEA_CONTOUR = rgbOf('#4a7f8c'), LEGEND_TEXT = rgbOf('#202020'), LEGEND_BACKGROUND = rgbOf('#f0f0ea');

function assertSize(size) { if (!Number.isInteger(size) || size < 1 || size > 8192) throw new Error(`[SynthesisReview] Map size must be an integer 1..8192, got ${size}`); }

/** Box-average resampling of a scalar raster to size x size (pixel footprints partition the source samples). @param {{columns:number,rows:number}} grid @param {ArrayLike<number>} values */
export function resampleArea(grid, values, size) {
    assertSize(size);
    const { columns, rows } = grid, output = new Float64Array(size * size), rowSums = new Float64Array(size * rows);
    for (let row = 0; row < rows; row++) {
        const base = row * columns;
        for (let px = 0; px < size; px++) {
            const c0 = Math.floor(px * columns / size), c1 = Math.max(c0 + 1, Math.floor((px + 1) * columns / size));
            let sum = 0;
            for (let c = c0; c < c1; c++) sum += values[base + c];
            rowSums[row * size + px] = sum / (c1 - c0);
        }
    }
    for (let py = 0; py < size; py++) {
        const r0 = Math.floor(py * rows / size), r1 = Math.max(r0 + 1, Math.floor((py + 1) * rows / size));
        for (let px = 0; px < size; px++) {
            let sum = 0;
            for (let r = r0; r < r1; r++) sum += rowSums[r * size + px];
            output[py * size + px] = sum / (r1 - r0);
        }
    }
    return output;
}

/** Nearest-sample resampling (categorical rasters). @param {{columns:number,rows:number}} grid @param {ArrayLike<number>} values */
export function resampleNearest(grid, values, size) {
    assertSize(size);
    const output = new Float64Array(size * size);
    for (let py = 0; py < size; py++) {
        const row = Math.min(grid.rows - 1, Math.floor((py + .5) * grid.rows / size));
        for (let px = 0; px < size; px++) output[py * size + px] = values[row * grid.columns + Math.min(grid.columns - 1, Math.floor((px + .5) * grid.columns / size))];
    }
    return output;
}

/** Per-sample Lambert shade of the terrain for one light direction (0..1). @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights */
export function hillshadeRaster(grid, heights, azimuthDegrees, altitudeDegrees, verticalExaggeration) {
    const { columns, rows, spacingX, spacingZ } = grid, shade = new Float32Array(columns * rows);
    const lx = Math.sin(azimuthDegrees * RADIANS) * Math.cos(altitudeDegrees * RADIANS), lz = Math.cos(azimuthDegrees * RADIANS) * Math.cos(altitudeDegrees * RADIANS), ly = Math.sin(altitudeDegrees * RADIANS);
    for (let row = 0; row < rows; row++) {
        const north = Math.max(0, row - 1), south = Math.min(rows - 1, row + 1);
        for (let column = 0; column < columns; column++) {
            const west = Math.max(0, column - 1), east = Math.min(columns - 1, column + 1), i = row * columns + column;
            const dhdx = (heights[row * columns + east] - heights[row * columns + west]) / ((east - west) * spacingX) * verticalExaggeration;
            const dhdz = (heights[north * columns + column] - heights[south * columns + column]) / ((south - north) * spacingZ) * verticalExaggeration;
            const length = Math.sqrt(dhdx * dhdx + 1 + dhdz * dhdz), dot = (-dhdx * lx + ly - dhdz * lz) / length;
            shade[i] = dot > 0 ? dot : 0;
        }
    }
    return shade;
}

function waterFraction(grid, heights, seaLevel, size) {
    const water = new Float32Array(heights.length);
    for (let i = 0; i < heights.length; i++) water[i] = heights[i] < seaLevel ? 1 : 0;
    return resampleArea(grid, water, size);
}

// legend entries flow left to right and wrap into further rows when the strip is narrower than the labels
function legendLayout(width, entries) {
    const rows = [[]];
    let x = 10;
    for (const entry of entries) {
        const advance = 28 + textWidth(entry.label, 2) + 18;
        if (x + advance > width && rows[rows.length - 1].length) { rows.push([]); x = 10; }
        rows[rows.length - 1].push({ ...entry, x });
        x += advance;
    }
    return { rows, height: LEGEND_HEIGHT + (rows.length - 1) * 24 };
}

function drawLegend(canvas, top, layout) {
    fillRect(canvas, 0, top, canvas.width, layout.height, LEGEND_BACKGROUND);
    layout.rows.forEach((row, index) => {
        for (const { color, label, x } of row) { fillRect(canvas, x, top + 14 + index * 24, 22, 16, color); drawText(canvas, x + 28, top + 15 + index * 24, label, LEGEND_TEXT, 2); }
    });
}

function shadeToCanvas(grid, shade, heights, seaLevel, size, waterTint) {
    const shaded = resampleArea(grid, shade, size), water = waterTint ? waterFraction(grid, heights, seaLevel, size) : null, canvas = createCanvas(size, size);
    for (let i = 0; i < size * size; i++) {
        const value = Math.min(1, shaded[i]), tint = water ? mixRgb([255, 255, 255], WATER_TINT, water[i]) : [255, 255, 255];
        canvas.data[i * 3] = Math.round(tint[0] * value); canvas.data[i * 3 + 1] = Math.round(tint[1] * value); canvas.data[i * 3 + 2] = Math.round(tint[2] * value);
    }
    return canvas;
}

/**
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights
 * @param {{azimuthDegrees?:number,altitudeDegrees?:number,verticalExaggeration?:number,size?:number,seaLevel?:number,waterTint?:boolean}} [options]
 */
export function renderHillshade(grid, heights, options = {}) {
    assertSynthesisGrid(grid, heights);
    const { azimuthDegrees = 315, altitudeDegrees = 45, verticalExaggeration = 1, size = 1024, seaLevel = 0, waterTint = true } = options;
    if (![azimuthDegrees, altitudeDegrees, verticalExaggeration, seaLevel].every(Number.isFinite) || !(verticalExaggeration > 0)) throw new Error('[SynthesisReview] Hillshade parameters must be finite (positive exaggeration)');
    return shadeToCanvas(grid, hillshadeRaster(grid, heights, azimuthDegrees, altitudeDegrees, verticalExaggeration), heights, seaLevel, size, waterTint);
}

/**
 * Hillshade of one fixed world window (edges on native vertices) at `size` pixels, so the same window compares across spacings: the shade
 * is computed on the window plus a one-sample halo (exact central differences inside the window) and only the window is drawn, each
 * native sample covering size / intervals pixels, so a coarse grid shows its sample blocks instead of an interpolated surface.
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights
 * @param {{window:{minX:number,maxX:number,minZ:number,maxZ:number},azimuthDegrees?:number,altitudeDegrees?:number,verticalExaggeration?:number,size?:number,seaLevel?:number,waterTint?:boolean}} options
 */
export function renderHillshadeWindow(grid, heights, options) {
    assertSynthesisGrid(grid, heights);
    const { window, azimuthDegrees = 315, altitudeDegrees = 45, verticalExaggeration = 1, size = 512, seaLevel = 0, waterTint = true } = options;
    if (![azimuthDegrees, altitudeDegrees, verticalExaggeration, seaLevel].every(Number.isFinite) || !(verticalExaggeration > 0)) throw new Error('[SynthesisReview] Hillshade parameters must be finite (positive exaggeration)');
    const haloed = extractGridWindow(grid, heights, window, { halo: 1 }), inner = extractGridWindow(grid, heights, window);
    const shade = hillshadeRaster(haloed.grid, haloed.values, azimuthDegrees, altitudeDegrees, verticalExaggeration), { columns, rows } = inner.grid, cropped = new Float32Array(columns * rows);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) cropped[row * columns + column] = shade[(row + haloed.halo.north) * haloed.grid.columns + column + haloed.halo.west];
    return shadeToCanvas(inner.grid, cropped, inner.values, seaLevel, size, waterTint);
}

/** Average of the 225, 270, 315 and 360 degree shades. @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights */
export function renderMultidirectionalHillshade(grid, heights, options = {}) {
    assertSynthesisGrid(grid, heights);
    const { azimuthsDegrees = [225, 270, 315, 360], altitudeDegrees = 45, verticalExaggeration = 1, size = 1024, seaLevel = 0, waterTint = true } = options;
    const shade = new Float32Array(heights.length);
    for (const azimuth of azimuthsDegrees) { const one = hillshadeRaster(grid, heights, azimuth, altitudeDegrees, verticalExaggeration); for (let i = 0; i < shade.length; i++) shade[i] += one[i] / azimuthsDegrees.length; }
    return shadeToCanvas(grid, shade, heights, seaLevel, size, waterTint);
}

/** Slope map classified into the histogram bins with a legend strip. @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights */
export function renderSlopeMap(grid, heights, options = {}) {
    assertSynthesisGrid(grid, heights);
    const { size = 1024, seaLevel = 0, workingLimitBytes = DEFAULT_WORKING_LIMIT_BYTES } = options, memory = new TerrainFieldMemory(workingLimitBytes);
    const slope = resampleArea(grid, slopeDegreesRaster(grid, heights, memory), size), water = waterFraction(grid, heights, seaLevel, size), edges = SLOPE_BIN_EDGES_DEGREES;
    memory.free('slope');
    const layout = legendLayout(size, edges.map((from, i) => ({ color: SLOPE_COLORS[i], label: i + 1 < edges.length ? `${from}-${edges[i + 1]}°` : `${from}°+` }))), canvas = createCanvas(size, size + layout.height);
    for (let i = 0; i < size * size; i++) {
        let bin = 0;
        while (bin + 1 < edges.length && slope[i] >= edges[bin + 1]) bin++;
        const color = mixRgb(SLOPE_COLORS[bin], WATER_TINT, water[i] * .7);
        canvas.data[i * 3] = color[0]; canvas.data[i * 3 + 1] = color[1]; canvas.data[i * 3 + 2] = color[2];
    }
    drawLegend(canvas, size, layout);
    return canvas;
}

/** @param {ReadonlyArray<import('./RasterCanvas.mjs').Rgb>} ramp @param {number} t 0..1 */
export function rampColor(ramp, t) {
    const clamped = Math.min(1, Math.max(0, t)) * (ramp.length - 1), k = Math.min(ramp.length - 2, Math.floor(clamped));
    return mixRgb(ramp[k], ramp[k + 1], clamped - k);
}

/** Local relief raster (meters) on a sequential ramp with a legend. @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} relief */
export function renderReliefMap(grid, relief, options = {}) {
    if (!(relief instanceof Float32Array) || relief.length !== grid.columns * grid.rows) throw new Error('[SynthesisReview] Relief raster must be a Float32Array of columns*rows samples');
    const { size = 1024, maxMeters, label = 'relief' } = options;
    if (!(maxMeters > 0)) throw new Error('[SynthesisReview] renderReliefMap needs a positive maxMeters for the ramp');
    const values = resampleArea(grid, relief, size), layout = legendLayout(size, [0, .25, .5, .75, 1].map(t => ({ color: rampColor(RELIEF_RAMP, t), label: `${(t * maxMeters).toFixed(0)} m` })).concat([{ color: LEGEND_BACKGROUND, label }]));
    const canvas = createCanvas(size, size + layout.height);
    for (let i = 0; i < size * size; i++) { const color = rampColor(RELIEF_RAMP, values[i] / maxMeters); canvas.data[i * 3] = color[0]; canvas.data[i * 3 + 1] = color[1]; canvas.data[i * 3 + 2] = color[2]; }
    drawLegend(canvas, size, layout);
    return canvas;
}

/** @param {number} height */
export function hypsometricColor(height) {
    if (height <= HYPSOMETRIC_STOPS[0][0]) return HYPSOMETRIC_STOPS[0][1];
    for (let i = 1; i < HYPSOMETRIC_STOPS.length; i++) {
        const [h0, c0] = HYPSOMETRIC_STOPS[i - 1], [h1, c1] = HYPSOMETRIC_STOPS[i];
        if (height <= h1) return mixRgb(c0, c1, (height - h0) / (h1 - h0));
    }
    return HYPSOMETRIC_STOPS[HYPSOMETRIC_STOPS.length - 1][1];
}

/** Hypsometric tint multiplied by hillshade with contour lines at a fixed interval. @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights */
export function renderElevationMap(grid, heights, options = {}) {
    assertSynthesisGrid(grid, heights);
    const { size = 1024, seaLevel = 0, contourIntervalMeters = 5, azimuthDegrees = 315, altitudeDegrees = 45, verticalExaggeration = 1 } = options;
    if (!(contourIntervalMeters > 0)) throw new Error('[SynthesisReview] Contour interval must be positive');
    const shade = hillshadeRaster(grid, heights, azimuthDegrees, altitudeDegrees, verticalExaggeration), flat = Math.sin(altitudeDegrees * RADIANS);
    const channels = [0, 1, 2].map(() => new Float32Array(heights.length));
    for (let i = 0; i < heights.length; i++) { const tint = hypsometricColor(heights[i]), light = Math.min(1.15, .3 + .7 * shade[i] / flat); for (let k = 0; k < 3; k++) channels[k][i] = tint[k] * light; }
    const resampled = channels.map(channel => resampleArea(grid, channel, size)), elevation = resampleArea(grid, heights, size);
    const layout = legendLayout(size, [-30, 0, 5, 18, 30, 40, 60].map(h => ({ color: hypsometricColor(h), label: `${h} m` })).concat([{ color: CONTOUR, label: `${contourIntervalMeters} m contours` }])), canvas = createCanvas(size, size + layout.height);
    for (let i = 0; i < size * size; i++) for (let k = 0; k < 3; k++) canvas.data[i * 3 + k] = Math.round(Math.min(255, resampled[k][i]));
    const level = i => Math.floor((elevation[i] - seaLevel) / contourIntervalMeters);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
        const i = py * size + px, here = level(i);
        if ((px + 1 < size && level(i + 1) !== here) || (py + 1 < size && level(i + size) !== here)) {
            const color = elevation[i] < seaLevel ? SEA_CONTOUR : CONTOUR;
            canvas.data[i * 3] = color[0]; canvas.data[i * 3 + 1] = color[1]; canvas.data[i * 3 + 2] = color[2];
        }
    }
    drawLegend(canvas, size, layout);
    return canvas;
}

/** Land-cover classes in the catalog colors (nearest resampling) with a legend. @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Uint8Array} cover */
export function renderCoverMap(grid, cover, options = {}) {
    if (!(cover instanceof Uint8Array) || cover.length !== grid.columns * grid.rows) throw new Error('[SynthesisReview] Cover raster must be a Uint8Array of columns*rows samples');
    const { size = 1024, catalog = LANDSCAPE_LAND_COVER_CATALOG } = options, colors = new Map(catalog.map(entry => [entry.id, rgbOf(entry.color)]));
    const values = resampleNearest(grid, cover, size), layout = legendLayout(size, catalog.map(entry => ({ color: colors.get(entry.id), label: `${entry.id} ${entry.label.replace(' (planning)', '')}` })));
    const canvas = createCanvas(size, size + layout.height);
    for (let i = 0; i < size * size; i++) {
        const color = colors.get(values[i]);
        if (!color) throw new Error(`[SynthesisReview] Cover class ${values[i]} is not in the catalog`);
        canvas.data[i * 3] = color[0]; canvas.data[i * 3 + 1] = color[1]; canvas.data[i * 3 + 2] = color[2];
    }
    drawLegend(canvas, size, layout);
    return canvas;
}
