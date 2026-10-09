// Slices the global geology channel bytes and labels into mask-aligned field pages and categorical pages for every chunk of the hierarchy.
// @ts-check
// A field page holds the chunk's samples plus the two-sample halo of the categorical mask pages (texel = sample + halo, row 0 north), two
// RGBA8 layers in channel order. Native pages copy the global bytes; a coarser page sample is the separable tent average (weights
// s - |offset| over the 2s - 1 aligned native samples per axis, s = sample stride) of the decoded native values, re-encoded, which is the
// linear-reconstruction prefilter for its spacing; positions outside the landscape clamp to the edge sample. A categorical page holds the
// four label layers of the aligned native samples (never averaged) without a halo, so every level reads identical labels at shared
// positions. Every value depends only on canonical global positions, so overlapping borders and halos are bit identical.
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS, decodeLandscapeGeologyChannel, encodeLandscapeGeologyChannel } from '../../../../src/app/landscape/LandscapeGeology.js';

const CHANNELS = LANDSCAPE_GEOLOGY_CHANNELS.length, CATEGORIES = LANDSCAPE_GEOLOGY_CATEGORIES.length;
const DECODE = LANDSCAPE_GEOLOGY_CHANNELS.map(definition => Float64Array.from({ length: 256 }, (_, byte) => decodeLandscapeGeologyChannel(definition, byte / 255)));

/**
 * @param {{columns:number,rows:number}} grid @param {Uint8Array[]} channels encoded global channels in catalog order @param {any} chunk manifest descriptor
 * @param {{samples:number,halo:number,width:number,layerBytes:number,pageBytes:number}} layout
 */
export function geologyFieldPage(grid, channels, chunk, layout) {
    const { columns, rows } = grid, stride = chunk.sampleStride, { halo, width, layerBytes } = layout;
    const page = new Uint8Array(layout.pageBytes);
    const clampColumn = c => c < 0 ? 0 : c >= columns ? columns - 1 : c, clampRow = r => r < 0 ? 0 : r >= rows ? rows - 1 : r;
    const weights = Array.from({ length: 2 * stride - 1 }, (_, i) => stride - Math.abs(i - stride + 1)), sums = new Float64Array(CHANNELS);
    for (let ty = 0; ty < width; ty++) for (let tx = 0; tx < width; tx++) {
        const column = chunk.startColumn + (tx - halo) * stride, row = chunk.startRow + (ty - halo) * stride, texel = (ty * width + tx) * 4;
        if (stride === 1) {
            const i = clampRow(row) * columns + clampColumn(column);
            for (let k = 0; k < CHANNELS; k++) page[(k >> 2) * layerBytes + texel + (k & 3)] = channels[k][i];
            continue;
        }
        sums.fill(0);
        let total = 0;
        for (let dz = 0; dz < weights.length; dz++) {
            const base = clampRow(row + dz - stride + 1) * columns, wz = weights[dz];
            for (let dx = 0; dx < weights.length; dx++) {
                const i = base + clampColumn(column + dx - stride + 1), w = wz * weights[dx];
                total += w;
                for (let k = 0; k < CHANNELS; k++) sums[k] += w * DECODE[k][channels[k][i]];
            }
        }
        for (let k = 0; k < CHANNELS; k++) page[(k >> 2) * layerBytes + texel + (k & 3)] = encodeLandscapeGeologyChannel(LANDSCAPE_GEOLOGY_CHANNELS[k], sums[k] / total);
    }
    return page;
}

/**
 * Aligned native labels of a chunk, four layers of samples x samples (layer k at k * layerBytes).
 * @param {{columns:number}} grid @param {Uint8Array[]} labels global label layers in category order @param {any} chunk @param {{categorical:{layerBytes:number,byteLength:number}}} layout
 */
export function geologyCategoricalPage(grid, labels, chunk, layout) {
    const page = new Uint8Array(layout.categorical.byteLength), layerBytes = layout.categorical.layerBytes, stride = chunk.sampleStride;
    for (let r = 0; r < chunk.rows; r++) for (let c = 0; c < chunk.columns; c++) {
        const i = (chunk.startRow + r * stride) * grid.columns + chunk.startColumn + c * stride, local = r * chunk.columns + c;
        for (let k = 0; k < CATEGORIES; k++) page[k * layerBytes + local] = labels[k][i];
    }
    return page;
}

/**
 * Recomputes one coarse texel from native field pages (validation of the tent prefilter without the global arrays).
 * @param {(column:number,row:number)=>Uint8Array} nativeTexel returns the eight channel bytes of a clamped native sample
 * @param {{columns:number,rows:number}} grid @param {any} chunk @param {number} tx @param {number} ty @param {number} halo
 */
export function geologyCoarseTexel(nativeTexel, grid, chunk, tx, ty, halo) {
    const stride = chunk.sampleStride, column = chunk.startColumn + (tx - halo) * stride, row = chunk.startRow + (ty - halo) * stride;
    const sums = new Float64Array(CHANNELS);
    let total = 0;
    for (let dz = -stride + 1; dz < stride; dz++) for (let dx = -stride + 1; dx < stride; dx++) {
        const w = (stride - Math.abs(dz)) * (stride - Math.abs(dx)), bytes = nativeTexel(Math.max(0, Math.min(grid.columns - 1, column + dx)), Math.max(0, Math.min(grid.rows - 1, row + dz)));
        total += w;
        for (let k = 0; k < CHANNELS; k++) sums[k] += w * DECODE[k][bytes[k]];
    }
    return Uint8Array.from({ length: CHANNELS }, (_, k) => encodeLandscapeGeologyChannel(LANDSCAPE_GEOLOGY_CHANNELS[k], sums[k] / total));
}
