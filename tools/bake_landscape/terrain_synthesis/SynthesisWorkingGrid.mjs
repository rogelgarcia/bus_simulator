// Derives the working grid of a synthesis recipe and moves heights between the native and working grids with documented filters.
// @ts-check
// A working grid keeps the recipe bounds and takes columns = extent / spacing + 1 (the recipe boundary requires exact divisibility).
// Native heights reach a coarser working grid through the separable tent average aligned to the working samples (weights s - |offset|
// over the 2s - 1 native samples per axis, s = integer stride, edges clamped), the same linear-reconstruction prefilter the terrain
// fields use for coarse pages, or through nearest (aligned) sampling; categorical cover always takes the aligned native label. The
// working result returns to the output grid by bilinear or Catmull-Rom bicubic interpolation at the output sample positions, so
// samples shared by both grids (every corner included) are reproduced exactly. A source landscape coarser than the recipe grid by an
// integer factor (AI 596 D4: the 2049² v2 base under the 4097² v3 recipe) is upsampled once at import (upsampleHeights: separable
// Catmull-Rom with the edge continued linearly so a linear ramp is reproduced exactly, bilinear, or nearest) and its cover takes the
// nearest source label with ties toward the lower index (upsampleCover); upsampled samples are interpolation, never source detail.

/** @typedef {{columns:number,rows:number,spacingX:number,spacingZ:number,minX:number,maxZ:number}} SynthesisGrid */

/** @param {any} recipe validated recipe @returns {SynthesisGrid} */
export function synthesisOutputGrid(recipe) {
    const { grid } = recipe;
    return Object.freeze({ columns: grid.columns, rows: grid.rows, spacingX: grid.spacingX, spacingZ: grid.spacingZ, minX: grid.bounds.minX, maxZ: grid.bounds.maxZ });
}

/** @param {any} recipe validated recipe @returns {{grid:SynthesisGrid,coarse:boolean}} */
export function synthesisWorkingGrid(recipe) {
    const output = synthesisOutputGrid(recipe), bounds = recipe.grid.bounds;
    if (recipe.working === null || recipe.working.spacing === output.spacingX && recipe.working.spacing === output.spacingZ) return { grid: output, coarse: false };
    const spacing = recipe.working.spacing;
    const grid = Object.freeze({ columns: Math.round((bounds.maxX - bounds.minX) / spacing) + 1, rows: Math.round((bounds.maxZ - bounds.minZ) / spacing) + 1, spacingX: spacing, spacingZ: spacing, minX: bounds.minX, maxZ: bounds.maxZ });
    return { grid, coarse: true };
}

/** Integer stride of a coarser aligned grid over a native grid, or an error naming the spacings. @param {SynthesisGrid} native @param {SynthesisGrid} working */
export function alignedStride(native, working) {
    const strideX = working.spacingX / native.spacingX, strideZ = working.spacingZ / native.spacingZ;
    if (Math.abs(strideX - Math.round(strideX)) > 1e-9 || Math.abs(strideZ - Math.round(strideZ)) > 1e-9 || Math.round(strideX) !== Math.round(strideZ) || Math.round(strideX) < 1
        || (working.columns - 1) * Math.round(strideX) !== native.columns - 1 || (working.rows - 1) * Math.round(strideZ) !== native.rows - 1) {
        throw new Error(`[Synthesis] The working spacing ${working.spacingX} must be an integer multiple of the native spacing ${native.spacingX} x ${native.spacingZ} covering the same extent`);
    }
    return Math.round(strideX);
}

/**
 * Decimates native heights to an aligned coarser grid (tent average or nearest) into `target`.
 * @param {SynthesisGrid} native @param {Float32Array} heights @param {SynthesisGrid} working @param {Float32Array} target @param {'tent'|'nearest'} filter
 */
export function decimateHeights(native, heights, working, target, filter) {
    const stride = alignedStride(native, working), { columns, rows } = native;
    if (stride === 1) { target.set(heights); return stride; }
    const weights = Array.from({ length: 2 * stride - 1 }, (_, i) => stride - Math.abs(i - stride + 1));
    for (let row = 0; row < working.rows; row++) for (let column = 0; column < working.columns; column++) {
        const nativeColumn = column * stride, nativeRow = row * stride;
        if (filter === 'nearest') { target[row * working.columns + column] = heights[nativeRow * columns + nativeColumn]; continue; }
        let sum = 0, total = 0;
        for (let dz = 0; dz < weights.length; dz++) {
            const r = Math.max(0, Math.min(rows - 1, nativeRow + dz - stride + 1)), base = r * columns, wz = weights[dz];
            for (let dx = 0; dx < weights.length; dx++) {
                const c = Math.max(0, Math.min(columns - 1, nativeColumn + dx - stride + 1)), w = wz * weights[dx];
                sum += w * heights[base + c]; total += w;
            }
        }
        target[row * working.columns + column] = sum / total;
    }
    return stride;
}

/** Aligned native labels on a coarser grid. @param {SynthesisGrid} native @param {Uint8Array} cover @param {SynthesisGrid} working @param {Uint8Array} target */
export function decimateCover(native, cover, working, target) {
    const stride = alignedStride(native, working);
    for (let row = 0; row < working.rows; row++) for (let column = 0; column < working.columns; column++) target[row * working.columns + column] = cover[row * stride * native.columns + column * stride];
    return stride;
}

const catmull = (t, out) => {
    const t2 = t * t, t3 = t2 * t;
    out[0] = -.5 * t3 + t2 - .5 * t; out[1] = 1.5 * t3 - 2.5 * t2 + 1; out[2] = -1.5 * t3 + 2 * t2 + .5 * t; out[3] = .5 * t3 - .5 * t2;
    return out;
};

export const UPSAMPLE_FILTERS = Object.freeze(['catmull-rom', 'bilinear', 'nearest']);

/**
 * Integer factor by which a finer aligned grid refines a coarser one over the same extent (1 when the grids are equal), or null when
 * the grids are not related that way (different extent, origin, or a non-integer ratio).
 * @param {SynthesisGrid} coarse @param {SynthesisGrid} fine
 */
export function upsampleFactor(coarse, fine) {
    const factor = coarse.spacingX / fine.spacingX;
    if (!Number.isInteger(factor) || factor < 1 || coarse.spacingZ / fine.spacingZ !== factor || coarse.minX !== fine.minX || coarse.maxZ !== fine.maxZ) return null;
    if ((coarse.columns - 1) * factor !== fine.columns - 1 || (coarse.rows - 1) * factor !== fine.rows - 1) return null;
    return factor;
}

// the nearest coarse index of fine index i under refinement k, ties (an exact midpoint) toward the lower index
const nearestCoarseIndex = (i, k) => Math.floor((i + (k - 1) / 2) / k);

// one separable Catmull-Rom pass from `count` coarse samples (read through `at`) to the (count - 1) * k + 1 fine samples written through
// `put`; the virtual samples beyond both ends continue the edge linearly (h(-1) = 2 h(0) - h(1)), so a linear ramp is reproduced exactly
function catmullLine(count, k, at, put, weights) {
    const fine = (count - 1) * k + 1, last = count - 1;
    const read = j => j < 0 ? 2 * at(0) - at(1) : j > last ? 2 * at(last) - at(last - 1) : at(j);
    for (let i = 0; i < fine; i++) {
        const base = Math.floor(i / k), offset = i - base * k;
        if (offset === 0) { put(i, at(base)); continue; }
        catmull(offset / k, weights);
        put(i, weights[0] * read(base - 1) + weights[1] * read(base) + weights[2] * read(base + 1) + weights[3] * read(base + 2));
    }
}

function bilinearLine(count, k, at, put) {
    const fine = (count - 1) * k + 1;
    for (let i = 0; i < fine; i++) {
        const base = Math.floor(i / k), offset = i - base * k;
        if (offset === 0) { put(i, at(base)); continue; }
        const t = offset / k;
        put(i, at(base) * (1 - t) + at(base + 1) * t);
    }
}

/**
 * Upsamples coarse heights onto a finer aligned grid (integer factor over the same extent) into `target`: separable Catmull-Rom with
 * linearly continued edges, bilinear, or nearest (ties toward the lower index); aligned samples are copied exactly by every filter.
 * `scratch` may hold a Float64Array of target.columns * source.rows values for the row pass (allocated here otherwise).
 * @param {SynthesisGrid} source @param {Float32Array} values @param {SynthesisGrid} target @param {Float32Array} out @param {'catmull-rom'|'bilinear'|'nearest'} filter
 * @param {{scratch?:Float64Array}} [options] @returns {number} the factor
 */
export function upsampleHeights(source, values, target, out, filter, { scratch } = {}) {
    const k = upsampleFactor(source, target);
    if (k === null) throw new Error(`[Synthesis] The target spacing ${target.spacingX} must refine the source spacing ${source.spacingX} by an integer factor over the same extent`);
    if (!UPSAMPLE_FILTERS.includes(filter)) throw new Error(`[Synthesis] Unsupported upsampling filter ${filter}`);
    const { columns, rows } = source, fineColumns = target.columns, fineRows = target.rows;
    if (k === 1) { out.set(values); return k; }
    if (filter === 'nearest') {
        for (let row = 0; row < fineRows; row++) {
            const base = nearestCoarseIndex(row, k) * columns;
            for (let column = 0; column < fineColumns; column++) out[row * fineColumns + column] = values[base + nearestCoarseIndex(column, k)];
        }
        return k;
    }
    const rowsPass = scratch && scratch.length >= fineColumns * rows ? scratch : new Float64Array(fineColumns * rows), weights = new Float64Array(4);
    for (let row = 0; row < rows; row++) {
        const base = row * columns, line = row * fineColumns, at = j => values[base + j], put = (i, value) => { rowsPass[line + i] = value; };
        if (filter === 'bilinear') bilinearLine(columns, k, at, put); else catmullLine(columns, k, at, put, weights);
    }
    for (let column = 0; column < fineColumns; column++) {
        const at = j => rowsPass[j * fineColumns + column], put = (i, value) => { out[i * fineColumns + column] = value; };
        if (filter === 'bilinear') bilinearLine(rows, k, at, put); else catmullLine(rows, k, at, put, weights);
    }
    return k;
}

/**
 * Nearest coarse label (ties toward the lower index) for every sample of a finer aligned grid.
 * @param {SynthesisGrid} source @param {Uint8Array} cover @param {SynthesisGrid} target @param {Uint8Array} out @returns {number} the factor
 */
export function upsampleCover(source, cover, target, out) {
    const k = upsampleFactor(source, target);
    if (k === null) throw new Error(`[Synthesis] The target spacing ${target.spacingX} must refine the source spacing ${source.spacingX} by an integer factor over the same extent`);
    if (k === 1) { out.set(cover); return k; }
    for (let row = 0; row < target.rows; row++) {
        const base = nearestCoarseIndex(row, k) * source.columns;
        for (let column = 0; column < target.columns; column++) out[row * target.columns + column] = cover[base + nearestCoarseIndex(column, k)];
    }
    return k;
}

/**
 * Samples a working-grid layer at every output sample (bilinear or Catmull-Rom bicubic, edges clamped) into `target`.
 * @param {SynthesisGrid} working @param {Float32Array} values @param {SynthesisGrid} output @param {Float32Array} target @param {'bilinear'|'bicubic'} filter
 */
export function resampleToGrid(working, values, output, target, filter) {
    const { columns, rows } = working, maxColumn = columns - 1, maxRow = rows - 1, wx = new Float64Array(4), wz = new Float64Array(4);
    const clampColumn = c => c < 0 ? 0 : c > maxColumn ? maxColumn : c, clampRow = r => r < 0 ? 0 : r > maxRow ? maxRow : r;
    for (let row = 0; row < output.rows; row++) {
        const z = output.maxZ - row * output.spacingZ, gz = Math.min(maxRow, Math.max(0, (working.maxZ - z) / working.spacingZ)), rz = Math.min(maxRow - 1, Math.floor(gz)), fz = Math.max(0, gz - rz);
        for (let column = 0; column < output.columns; column++) {
            const x = output.minX + column * output.spacingX, gx = Math.min(maxColumn, Math.max(0, (x - working.minX) / working.spacingX)), cx = Math.min(maxColumn - 1, Math.floor(gx)), fx = Math.max(0, gx - cx);
            let value;
            if (filter === 'bilinear') {
                const a = values[rz * columns + cx], b = values[rz * columns + cx + 1], c = values[(rz + 1) * columns + cx], d = values[(rz + 1) * columns + cx + 1];
                value = fz === 0 && fx === 0 ? a : (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
            } else if (fz === 0 && fx === 0) value = values[rz * columns + cx];
            else {
                catmull(fx, wx); catmull(fz, wz); value = 0;
                for (let j = 0; j < 4; j++) {
                    const base = clampRow(rz - 1 + j) * columns;
                    let line = 0;
                    for (let i = 0; i < 4; i++) line += wx[i] * values[base + clampColumn(cx - 1 + i)];
                    value += wz[j] * line;
                }
            }
            target[row * output.columns + column] = value;
        }
    }
}
