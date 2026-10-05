// Shares bounded full-grid allocation tracking, separable smoothing, slope and robust statistics for the global terrain analyses.
// @ts-check
// Every full-resolution array of the global stage is allocated through TerrainFieldMemory so the peak tracked bytes are measured and
// refused above the declared working limit. Smoothing uses truncated windows (out-of-landscape samples carry no weight), running in
// float64 with a fixed visitation order, so repeated runs are bit identical.

export class TerrainFieldMemory {
    /** @param {number} limitBytes */
    constructor(limitBytes) {
        if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) throw new Error('[TerrainFields] Working limit must be a positive byte count');
        this.limitBytes = limitBytes;
        this.entries = new Map();
        this.bytes = 0;
        this.peakBytes = 0;
        this.peakPhase = null;
        this.phase = 'setup';
        this.phases = [];
    }

    /** @template {Float64ArrayConstructor|Float32ArrayConstructor|Int32ArrayConstructor|Uint8ArrayConstructor|Uint32ArrayConstructor} T @param {string} name @param {T} Type @param {number} length @returns {InstanceType<T>} */
    allocate(name, Type, length) {
        if (this.entries.has(name)) throw new Error(`[TerrainFields] Duplicate working array ${name}`);
        const bytes = length * Type.BYTES_PER_ELEMENT;
        if (this.bytes + bytes > this.limitBytes) throw new Error(`[TerrainFields] ${name} (${bytes} bytes) exceeds the ${this.limitBytes}-byte working limit in phase ${this.phase}`);
        const array = /** @type {any} */ (new Type(length));
        this.entries.set(name, bytes);
        this.bytes += bytes;
        if (this.bytes > this.peakBytes) { this.peakBytes = this.bytes; this.peakPhase = this.phase; }
        return array;
    }

    /** Resizes a growable array (heap, seed lists) while keeping the ledger exact. @template T @param {string} name @param {T & {length:number,constructor:any,set:Function}} array @param {number} length @returns {T} */
    grow(name, array, length) {
        const Type = array.constructor, bytes = length * Type.BYTES_PER_ELEMENT, old = this.entries.get(name);
        if (old === undefined) throw new Error(`[TerrainFields] Cannot grow untracked array ${name}`);
        if (this.bytes - old + bytes > this.limitBytes) throw new Error(`[TerrainFields] Growing ${name} exceeds the ${this.limitBytes}-byte working limit`);
        const next = new Type(length);
        next.set(array);
        this.entries.set(name, bytes);
        this.bytes += bytes - old;
        if (this.bytes > this.peakBytes) { this.peakBytes = this.bytes; this.peakPhase = this.phase; }
        return next;
    }

    /** @param {...string} names */
    free(...names) {
        for (const name of names) {
            const bytes = this.entries.get(name);
            if (bytes === undefined) throw new Error(`[TerrainFields] Cannot free untracked array ${name}`);
            this.entries.delete(name);
            this.bytes -= bytes;
        }
    }

    /** @param {string} name */
    enter(name) {
        this.phase = name;
        this.phases.push({ phase: name, trackedBytes: this.bytes, processArrayBuffers: process.memoryUsage().arrayBuffers });
    }

    report() {
        return { limitBytes: this.limitBytes, peakTrackedBytes: this.peakBytes, peakPhase: this.peakPhase, residentTrackedBytes: this.bytes,
            residentArrays: [...this.entries.keys()].sort(), phases: this.phases.map(entry => ({ ...entry })) };
    }
}

/** @param {{columns:number,rows:number}} grid */
export function gridCells(grid) { return grid.columns * grid.rows; }

/**
 * Central-difference terrain gradient on the full grid, matching the mesh vertex normals (one-sided only at the landscape edge).
 * dhdx is the east derivative and dhdz the north derivative (rows increase to the south).
 * @param {{columns:number,rows:number,spacingX:number,spacingZ:number}} grid @param {Float32Array} heights @param {TerrainFieldMemory} memory
 */
export function terrainGradient(grid, heights, memory, prefix = '') {
    const { columns, rows, spacingX, spacingZ } = grid, n = columns * rows;
    const dhdx = memory.allocate(`${prefix}dhdx`, Float32Array, n), dhdz = memory.allocate(`${prefix}dhdz`, Float32Array, n);
    for (let row = 0; row < rows; row++) {
        const north = Math.max(0, row - 1), south = Math.min(rows - 1, row + 1);
        for (let column = 0; column < columns; column++) {
            const west = Math.max(0, column - 1), east = Math.min(columns - 1, column + 1), i = row * columns + column;
            dhdx[i] = (heights[row * columns + east] - heights[row * columns + west]) / ((east - west) * spacingX);
            dhdz[i] = (heights[north * columns + column] - heights[south * columns + column]) / ((south - north) * spacingZ);
        }
    }
    return { dhdx, dhdz };
}

/** @param {number} sigmaSamples @param {number} [passes] @returns {{radii:number[],sigmaSamples:number}} Kovesi box radii approximating a Gaussian */
export function gaussianBoxRadii(sigmaSamples, passes = 3) {
    if (!(sigmaSamples > 0)) throw new Error('[TerrainFields] Gaussian sigma must be positive');
    const ideal = Math.sqrt(12 * sigmaSamples * sigmaSamples / passes + 1);
    let lower = Math.floor(ideal);
    if (lower % 2 === 0) lower--;
    const upper = lower + 2;
    const lowerPasses = Math.max(0, Math.min(passes, Math.round((12 * sigmaSamples * sigmaSamples - passes * lower * lower - 4 * passes * lower - 3 * passes) / (-4 * lower - 4))));
    const radii = Array.from({ length: passes }, (_, i) => ((i < lowerPasses ? lower : upper) - 1) / 2);
    const variance = radii.reduce((sum, radius) => sum + ((2 * radius + 1) ** 2 - 1) / 12, 0);
    return { radii, sigmaSamples: Math.sqrt(variance) };
}

// one truncated box pass along rows (axis 0) or columns (axis 1); sums only in-landscape samples and divides by their count
function boxPass(grid, source, target, radius, axis, scratch) {
    const { columns, rows } = grid, length = axis === 0 ? columns : rows, lines = axis === 0 ? rows : columns;
    const strideAlong = axis === 0 ? 1 : columns, strideAcross = axis === 0 ? columns : 1;
    for (let line = 0; line < lines; line++) {
        const base = line * strideAcross;
        scratch[0] = 0;
        for (let i = 0; i < length; i++) scratch[i + 1] = scratch[i] + source[base + i * strideAlong];
        for (let i = 0; i < length; i++) {
            const low = Math.max(0, i - radius), high = Math.min(length - 1, i + radius);
            target[base + i * strideAlong] = (scratch[high + 1] - scratch[low]) / (high - low + 1);
        }
    }
}

/**
 * Gaussian-approximating smoothing (three truncated box passes per axis, Kovesi radii) into a new float64 array.
 * @param {{columns:number,rows:number}} grid @param {ArrayLike<number>} values @param {number} sigmaSamples @param {TerrainFieldMemory} memory @param {string} name
 */
export function gaussianSmooth(grid, values, sigmaSamples, memory, name) {
    const n = gridCells(grid), { radii } = sigmaSamples > 0 ? gaussianBoxRadii(sigmaSamples) : { radii: [] };
    const output = memory.allocate(name, Float64Array, n), temporary = memory.allocate(`${name}/temporary`, Float64Array, n);
    const scratch = new Float64Array(Math.max(grid.columns, grid.rows) + 1);
    for (let i = 0; i < n; i++) output[i] = values[i];
    for (const axis of [0, 1]) for (const radius of radii) {
        if (radius === 0) continue;
        boxPass(grid, output, temporary, radius, axis, scratch);
        output.set(temporary);
    }
    memory.free(`${name}/temporary`);
    return output;
}

/**
 * Normalized convolution: smooths value·weight and weight with the same Gaussian, so samples outside the mask carry no influence.
 * Returns the smoothed weight (local confidence) and writes the weighted mean into `mean` where confidence > minimum.
 * @param {{columns:number,rows:number}} grid @param {Float64Array} weightedValues @param {Float64Array} weights @param {number} sigmaSamples @param {TerrainFieldMemory} memory @param {string} name
 */
export function normalizedConvolution(grid, weightedValues, weights, sigmaSamples, memory, name) {
    const numerator = gaussianSmooth(grid, weightedValues, sigmaSamples, memory, `${name}/numerator`);
    const denominator = gaussianSmooth(grid, weights, sigmaSamples, memory, `${name}/denominator`);
    return { numerator, denominator, release: () => memory.free(`${name}/numerator`, `${name}/denominator`) };
}

/**
 * Deterministic nearest-rank-below percentile of the selected values (sorted float64 copy).
 * @param {ArrayLike<number>} values @param {(index:number)=>boolean} include @param {number[]} percentiles @param {TerrainFieldMemory} memory @param {string} name
 */
export function robustPercentiles(values, include, percentiles, memory, name) {
    let count = 0;
    for (let i = 0; i < values.length; i++) if (include(i) && Number.isFinite(values[i])) count++;
    if (!count) return { count: 0, values: percentiles.map(() => 0) };
    const sorted = memory.allocate(name, Float64Array, count);
    let at = 0;
    for (let i = 0; i < values.length; i++) if (include(i) && Number.isFinite(values[i])) sorted[at++] = values[i];
    sorted.sort();
    const result = percentiles.map(p => sorted[Math.min(count - 1, Math.max(0, Math.floor(p / 100 * (count - 1))))]);
    memory.free(name);
    return { count, values: result };
}

export const clamp = (value, low, high) => value < low ? low : value > high ? high : value;
export const smoothstep = (edge0, edge1, value) => { const t = clamp((value - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
