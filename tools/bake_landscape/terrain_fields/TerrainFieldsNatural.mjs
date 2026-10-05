// Infers a natural display soil for every planning-only native sample from terrain properties and surrounding natural soils.
// @ts-check
// natural-terrain-inference-v1: each candidate soil k scores priorWeight * log(regional prior R_k) + terrainWeight * sum_f log P(f | k).
// R_k is the normalized convolution of the natural (non-planning) one-hot soils at three Gaussian scales, computed on a stride-4 aligned
// grid (box-averaged inputs) and bilinearly upsampled; scales combine by their local natural-sample confidence, so samples next to a block
// border continue the neighboring soil and block interiors follow the regional mix. P(f | k) is learned from this landscape's own natural
// samples: tent-binned histograms of shore distance, height above sea level, smoothed slope and smoothed wetness, smoothed across bins,
// with a pseudo-count, evaluated by linear interpolation so labels change continuously with terrain. The label is the deterministic argmax
// (catalog order breaks ties). Non-planning samples keep their semantic soil; nothing edits cover, soil semantics or queries.
import { clamp, gaussianSmooth } from './TerrainFieldsGrid.mjs';

const FEATURES = Object.freeze(['shoreMeters', 'heightMeters', 'slopeDegrees', 'wetness']);

/** Smoothed per-candidate feature densities learned from natural samples. */
export class NaturalSoilLikelihood {
    /** @param {any} model recipe.likelihood @param {number} candidates */
    constructor(model, candidates) {
        this.model = model;
        this.bins = model.bins;
        this.ranges = FEATURES.map(name => model.features[name]);
        this.counts = FEATURES.map(() => Array.from({ length: candidates }, () => new Float64Array(model.bins)));
        this.logDensity = null;
        this.samples = new Float64Array(candidates);
    }

    position(feature, value) {
        const [low, high] = this.ranges[feature];
        return clamp((value - low) / (high - low), 0, 1) * (this.bins - 1);
    }

    /** @param {number} candidate @param {number[]} values in FEATURES order */
    add(candidate, values) {
        this.samples[candidate]++;
        for (let f = 0; f < FEATURES.length; f++) {
            const t = this.position(f, values[f]), bin = Math.min(this.bins - 2, Math.floor(t)), fraction = t - bin, counts = this.counts[f][candidate];
            counts[bin] += 1 - fraction; counts[bin + 1] += fraction;
        }
    }

    finish() {
        const radius = Math.ceil(this.model.binSmoothing * 3), kernel = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-0.5 * ((i - radius) / this.model.binSmoothing) ** 2));
        this.logDensity = this.counts.map(perCandidate => perCandidate.map(counts => {
            const smooth = new Float64Array(this.bins);
            for (let b = 0; b < this.bins; b++) {
                let sum = 0, weight = 0;
                for (let k = -radius; k <= radius; k++) { const at = b + k; if (at < 0 || at >= this.bins) continue; sum += counts[at] * kernel[k + radius]; weight += kernel[k + radius]; }
                smooth[b] = sum / weight + this.model.pseudoCount;
            }
            const total = smooth.reduce((a, b) => a + b, 0);
            return smooth.map(value => Math.log(value / total));
        }));
        return this;
    }

    /** Linear interpolation of the log density between bin centers. @param {number} candidate @param {number[]} values */
    logLikelihood(candidate, values) {
        let sum = 0;
        for (let f = 0; f < FEATURES.length; f++) {
            const t = this.position(f, values[f]), bin = Math.min(this.bins - 2, Math.floor(t)), fraction = t - bin, table = this.logDensity[f][candidate];
            sum += table[bin] * (1 - fraction) + table[bin + 1] * fraction;
        }
        return sum;
    }

    summary(candidates) {
        return Object.fromEntries(candidates.map((entry, k) => [entry.id, { naturalSamples: this.samples[k] }]));
    }
}

/**
 * @param {{grid:{columns:number,rows:number,spacingX:number},heights:Float32Array,seaLevel:number,semanticSoil:Uint8Array,planning:Uint8Array,
 *   soilIds:string[],shore:Float32Array,slopeDegrees:Float32Array,wetness:Uint8Array,recipe:any,memory:import('./TerrainFieldsGrid.mjs').TerrainFieldMemory}} input
 * planning: 1 for planning-only cover; semanticSoil: catalog index of each sample's mapped soil; wetness: encoded linear channel bytes
 */
export function inferNaturalSoil({ grid, heights, seaLevel, semanticSoil, planning, soilIds, shore, slopeDegrees, wetness, recipe, memory }) {
    const { columns, rows } = grid, n = columns * rows, stride = recipe.prior.decimation;
    const candidates = recipe.candidates.map(id => ({ id, index: soilIds.indexOf(id) })).filter(entry => entry.index >= 0);
    if (!candidates.length) throw new Error('[TerrainFields] The soil catalog contains no natural inference candidates');
    const candidateOf = new Int8Array(256).fill(-1);
    candidates.forEach((entry, k) => { candidateOf[entry.index] = k; });
    const coarseColumns = Math.floor((columns - 1) / stride) + 1, coarseRows = Math.floor((rows - 1) / stride) + 1, coarseCells = coarseColumns * coarseRows;
    const coarseGrid = { columns: coarseColumns, rows: coarseRows };
    // aligned stride-4 box averages of natural fractions per candidate
    const natural = memory.allocate('natural/fraction', Float64Array, coarseCells);
    const fractions = candidates.map(entry => memory.allocate(`natural/fraction-${entry.id}`, Float64Array, coarseCells));
    const half = stride >> 1, counts = new Float64Array(candidates.length);
    for (let row = 0; row < coarseRows; row++) for (let column = 0; column < coarseColumns; column++) {
        let count = 0, naturalCount = 0;
        counts.fill(0);
        for (let r = Math.max(0, row * stride - half); r <= Math.min(rows - 1, row * stride + half); r++) for (let c = Math.max(0, column * stride - half); c <= Math.min(columns - 1, column * stride + half); c++) {
            const i = r * columns + c;
            count++;
            if (planning[i]) continue;
            naturalCount++;
            const k = candidateOf[semanticSoil[i]];
            if (k >= 0) counts[k]++;
        }
        const at = row * coarseColumns + column;
        natural[at] = naturalCount / count;
        for (let k = 0; k < candidates.length; k++) fractions[k][at] = counts[k] / count;
    }
    // multi-scale normalized convolution, combined by natural confidence
    const accumulated = candidates.map(entry => memory.allocate(`natural/accumulated-${entry.id}`, Float64Array, coarseCells));
    const confidenceTotal = memory.allocate('natural/confidence', Float64Array, coarseCells);
    recipe.prior.scalesMeters.forEach((scale, j) => {
        const sigma = scale / (grid.spacingX * stride), weight = recipe.prior.weights[j];
        const denominator = gaussianSmooth(coarseGrid, natural, sigma, memory, `natural/denominator-${j}`);
        candidates.forEach((entry, k) => {
            const numerator = gaussianSmooth(coarseGrid, fractions[k], sigma, memory, `natural/numerator-${j}-${k}`);
            for (let i = 0; i < coarseCells; i++) if (denominator[i] > 1e-9) accumulated[k][i] += weight * numerator[i];
            memory.free(`natural/numerator-${j}-${k}`);
        });
        for (let i = 0; i < coarseCells; i++) if (denominator[i] > 1e-9) confidenceTotal[i] += weight * denominator[i];
        memory.free(`natural/denominator-${j}`);
    });
    const prior = candidates.map(entry => memory.allocate(`natural/prior-${entry.id}`, Float32Array, coarseCells));
    for (let i = 0; i < coarseCells; i++) for (let k = 0; k < candidates.length; k++) {
        prior[k][i] = confidenceTotal[i] > 1e-9 ? accumulated[k][i] / confidenceTotal[i] : 1 / candidates.length;
    }
    memory.free('natural/fraction', 'natural/confidence', ...candidates.flatMap(entry => [`natural/fraction-${entry.id}`, `natural/accumulated-${entry.id}`]));
    // smoothed native terrain features
    const slope = gaussianSmooth(grid, slopeDegrees, recipe.inputSmoothing.slopeSamples, memory, 'natural/slope');
    const wet = memory.allocate('natural/wetness-input', Float64Array, n);
    for (let i = 0; i < n; i++) wet[i] = wetness[i] / 255;
    const wetSmooth = gaussianSmooth(grid, wet, recipe.inputSmoothing.wetnessSamples, memory, 'natural/wetness');
    memory.free('natural/wetness-input');
    const features = [0, 0, 0, 0], featuresAt = i => { features[0] = shore[i]; features[1] = heights[i] - seaLevel; features[2] = slope[i]; features[3] = wetSmooth[i]; return features; };
    const likelihood = new NaturalSoilLikelihood(recipe.likelihood, candidates.length);
    for (let i = 0; i < n; i++) {
        if (planning[i]) continue;
        const k = candidateOf[semanticSoil[i]];
        if (k >= 0) likelihood.add(k, featuresAt(i));
    }
    likelihood.finish();
    // the terrain evidence of every candidate is smoothed spatially, so narrow planning strips follow their surroundings and only
    // broad terrain trends move a boundary
    const evidence = candidates.map((entry, k) => {
        const raw = memory.allocate(`natural/evidence-raw-${entry.id}`, Float32Array, n);
        for (let i = 0; i < n; i++) raw[i] = likelihood.logLikelihood(k, featuresAt(i));
        const smooth = gaussianSmooth(grid, raw, recipe.likelihood.spatialSmoothingSamples, memory, `natural/evidence-smooth-${entry.id}`);
        memory.free(`natural/evidence-raw-${entry.id}`);
        const stored = memory.allocate(`natural/evidence-${entry.id}`, Float32Array, n);
        stored.set(smooth);
        memory.free(`natural/evidence-smooth-${entry.id}`);
        return stored;
    });
    memory.free('natural/slope', 'natural/wetness');
    const labels = memory.allocate('natural/labels', Uint8Array, n);
    const inferred = Object.fromEntries(candidates.map(entry => [entry.id, 0]));
    const scores = new Float64Array(candidates.length);
    let planningSamples = 0;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        if (!planning[i]) { labels[i] = semanticSoil[i]; continue; }
        planningSamples++;
        const gx = column / stride, gz = row / stride, x0 = Math.min(coarseColumns - 2, Math.floor(gx)), z0 = Math.min(coarseRows - 2, Math.floor(gz));
        const fx = clamp(gx - x0, 0, 1), fz = clamp(gz - z0, 0, 1), c00 = z0 * coarseColumns + x0;
        let best = 0;
        for (let k = 0; k < candidates.length; k++) {
            const p = prior[k], regional = (p[c00] * (1 - fx) + p[c00 + 1] * fx) * (1 - fz) + (p[c00 + coarseColumns] * (1 - fx) + p[c00 + coarseColumns + 1] * fx) * fz;
            scores[k] = recipe.priorWeight * Math.log(regional + recipe.prior.floor) + recipe.terrainWeight * evidence[k][i];
            if (scores[k] > scores[best]) best = k;
        }
        labels[i] = candidates[best].index;
        inferred[candidates[best].id]++;
    }
    memory.free(...candidates.flatMap(entry => [`natural/prior-${entry.id}`, `natural/evidence-${entry.id}`]));
    let speckles = 0;
    for (let row = 1; row < rows - 1; row++) for (let column = 1; column < columns - 1; column++) {
        const i = row * columns + column;
        if (!planning[i]) continue;
        let same = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && labels[i + dr * columns + dc] === labels[i]) same++;
        if (same < 3) speckles++;
    }
    return { labels, likelihood, statistics: { policy: recipe.policy, planningSamples, inferredCounts: inferred, speckleSamples: speckles,
        learnedFrom: likelihood.summary(candidates), priorGrid: { columns: coarseColumns, rows: coarseRows, stride } } };
}
