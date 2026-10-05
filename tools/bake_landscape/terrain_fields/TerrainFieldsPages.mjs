// Slices the global encoded channels into mask-aligned field pages and natural-soil pages for every chunk of the hierarchy.
// @ts-check
// A page holds the chunk's samples plus the two-sample halo of the categorical mask pages (texel = sample + halo, row 0 north), four
// RGBA8 layers in channel order. Native pages copy the global bytes; a coarser page sample is the separable tent average (weights
// s - |offset| over the 2s - 1 aligned native samples per axis, s = sample stride) of the decoded native values, re-encoded, which is the
// linear-reconstruction prefilter for its spacing; positions outside the landscape clamp to the edge sample. Natural soil pages are the
// aligned native labels (no averaging) without a halo, matching the land-cover channel, and exist only where an aligned sample is
// planning-only cover. Every value depends only on canonical global positions, so overlapping borders and halos are bit identical.
import { LANDSCAPE_TERRAIN_FIELD_CHANNELS, decodeLandscapeTerrainField, encodeLandscapeTerrainField } from '../../../src/app/landscape/LandscapeTerrainFields.js';

const DECODE = LANDSCAPE_TERRAIN_FIELD_CHANNELS.map(definition => Float64Array.from({ length: 256 }, (_, byte) => decodeLandscapeTerrainField(definition, byte / 255)));

/**
 * @param {{columns:number,rows:number}} grid @param {Uint8Array[]} channels @param {any} chunk manifest descriptor
 * @param {{samples:number,halo:number,width:number,layerBytes:number,pageBytes:number}} layout
 */
export function terrainFieldPage(grid, channels, chunk, layout) {
    const { columns, rows } = grid, stride = chunk.sampleStride, { halo, width, layerBytes } = layout;
    const page = new Uint8Array(layout.pageBytes);
    const clampColumn = c => c < 0 ? 0 : c >= columns ? columns - 1 : c, clampRow = r => r < 0 ? 0 : r >= rows ? rows - 1 : r;
    const weights = Array.from({ length: 2 * stride - 1 }, (_, i) => stride - Math.abs(i - stride + 1)), sums = new Float64Array(16);
    for (let ty = 0; ty < width; ty++) for (let tx = 0; tx < width; tx++) {
        const column = chunk.startColumn + (tx - halo) * stride, row = chunk.startRow + (ty - halo) * stride, texel = (ty * width + tx) * 4;
        if (stride === 1) {
            const i = clampRow(row) * columns + clampColumn(column);
            for (let k = 0; k < 16; k++) page[(k >> 2) * layerBytes + texel + (k & 3)] = channels[k][i];
            continue;
        }
        sums.fill(0);
        let total = 0;
        for (let dz = 0; dz < weights.length; dz++) {
            const base = clampRow(row + dz - stride + 1) * columns, wz = weights[dz];
            for (let dx = 0; dx < weights.length; dx++) {
                const i = base + clampColumn(column + dx - stride + 1), w = wz * weights[dx];
                total += w;
                for (let k = 0; k < 16; k++) sums[k] += w * DECODE[k][channels[k][i]];
            }
        }
        for (let k = 0; k < 16; k++) page[(k >> 2) * layerBytes + texel + (k & 3)] = encodeLandscapeTerrainField(LANDSCAPE_TERRAIN_FIELD_CHANNELS[k], sums[k] / total);
    }
    return page;
}

/**
 * Aligned natural labels of a chunk, or null when none of its aligned samples is planning-only cover.
 * @param {{columns:number}} grid @param {Uint8Array} labels @param {Uint8Array} cover @param {Uint8Array} planningCover @param {any} chunk
 */
export function terrainFieldNaturalSoilPage(grid, labels, cover, planningCover, chunk) {
    const page = new Uint8Array(chunk.columns * chunk.rows);
    let planning = false;
    for (let r = 0; r < chunk.rows; r++) for (let c = 0; c < chunk.columns; c++) {
        const i = (chunk.startRow + r * chunk.sampleStride) * grid.columns + chunk.startColumn + c * chunk.sampleStride;
        page[r * chunk.columns + c] = labels[i];
        if (planningCover[cover[i]]) planning = true;
    }
    return planning ? page : null;
}

/**
 * Recomputes one coarse texel from native field pages (validation of the tent prefilter without the global arrays).
 * @param {(column:number,row:number)=>Uint8Array} nativeTexel returns the sixteen channel bytes of a clamped native sample
 * @param {{columns:number,rows:number}} grid @param {any} chunk @param {number} tx @param {number} ty @param {number} halo
 */
export function terrainFieldCoarseTexel(nativeTexel, grid, chunk, tx, ty, halo) {
    const stride = chunk.sampleStride, column = chunk.startColumn + (tx - halo) * stride, row = chunk.startRow + (ty - halo) * stride;
    const sums = new Float64Array(16);
    let total = 0;
    for (let dz = -stride + 1; dz < stride; dz++) for (let dx = -stride + 1; dx < stride; dx++) {
        const w = (stride - Math.abs(dz)) * (stride - Math.abs(dx)), bytes = nativeTexel(Math.max(0, Math.min(grid.columns - 1, column + dx)), Math.max(0, Math.min(grid.rows - 1, row + dz)));
        total += w;
        for (let k = 0; k < 16; k++) sums[k] += w * DECODE[k][bytes[k]];
    }
    return Uint8Array.from({ length: 16 }, (_, k) => encodeLandscapeTerrainField(LANDSCAPE_TERRAIN_FIELD_CHANNELS[k], sums[k] / total));
}
