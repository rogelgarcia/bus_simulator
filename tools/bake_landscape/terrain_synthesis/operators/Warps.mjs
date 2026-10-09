// Implements the warp (domain warp of the height layer) and noise (bounded world-anchored octaves) operators.
// @ts-check
// Both are driven by LandscapeSurfaceNoise with the operator seed: noise adds amplitudeMeters * (octave sum / octave bound), which is
// a pure function of the world position, while warp reads the bilinear height at the position displaced by two noise fields bounded
// by strengthMeters, so it needs a halo of strengthMeters plus one sample when evaluated on a window.
import { createLandscapeNoiseOctaves, createLandscapeSurfaceWarp } from '../../../../src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { sampleHeight } from './Landforms.mjs';

const round6 = value => Math.round(value * 1e6) / 1e6;

/** Noise sampler of the noise operator in world meters (shared with the halo test). @param {number} seed @param {any} params */
export function createNoiseField(seed, params) {
    const octaves = createLandscapeNoiseOctaves({ seed, component: 0, wavelengths: [...params.wavelengthsMeters], amplitudes: [...params.amplitudes], shaping: params.shaping, ridgedMix: params.ridgedMix });
    const normalization = octaves.amplitude || 1;
    return (x, z) => params.amplitudeMeters * octaves.evaluate(x, z) / normalization;
}

async function noise(context) {
    const { params, seed } = context.operator, { grid } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, heights = context.layers.get('height'), mask = context.mask();
    const field = createNoiseField(seed, params);
    let minimum = Infinity, maximum = -Infinity;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, value = field(minX + column * spacingX, z) * (mask ? mask[i] : 1);
            heights[i] += value;
            if (value < minimum) minimum = value; if (value > maximum) maximum = value;
        }
    }
    return { seed, octaves: params.wavelengthsMeters.length, addedRangeMeters: [round6(minimum), round6(maximum)] };
}

async function warp(context) {
    const { params, seed } = context.operator, { grid, scope } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, heights = context.layers.get('height'), mask = context.mask();
    const total = params.amplitudes.reduce((sum, amplitude) => sum + amplitude, 0) || 1;
    const field = createLandscapeSurfaceWarp({ seed, wavelengths: [...params.wavelengthsMeters], amplitudes: params.amplitudes.map(amplitude => amplitude / total * params.strengthMeters), shaping: params.shaping });
    const source = scope.allocate('warp-source', Float32Array, n), displacement = new Float64Array(2);
    source.set(heights);
    let maxDisplacement = 0, maxChange = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, x = minX + column * spacingX;
            field.evaluate(x, z, displacement);
            const designed = sampleHeight(grid, source, x + displacement[0], z + displacement[1]), G = source[i];
            heights[i] = G + (mask ? mask[i] : 1) * (designed - G);
            const shift = Math.hypot(displacement[0], displacement[1]);
            if (shift > maxDisplacement) maxDisplacement = shift;
            if (Math.abs(heights[i] - G) > maxChange) maxChange = Math.abs(heights[i] - G);
        }
    }
    scope.free('warp-source');
    return { seed, maxDisplacementMeters: round6(maxDisplacement), maxChangeMeters: round6(maxChange) };
}

export const WARP_OPERATORS = Object.freeze({ warp, noise });
