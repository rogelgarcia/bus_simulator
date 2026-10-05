// Prefilters the calibrated sky environment for the rough mirror reflection of the landscape water (pure, renderer independent).
// @ts-check
// Design: the water reflects the sky through one GGX roughness (its Cox-Munk sea state), so a single split-sum prefiltered map is all it
// needs. It replaces a three.js PMREM, whose GGX convolution shader unrolls 256 constant Hammersley samples that the Direct3D shader
// compiler reports as X4122 precision warnings. The estimator is the PMREM's own (V = N = R, weight D(h)·(n·l)), integrated over the
// environment texels instead of importance sampled: the environment is first averaged onto the output grid (solid-angle weighted), then
// every output row gathers the source rows within the lobe support through one precomputed kernel per row pair, because the weight depends
// on the two elevations and the azimuth difference only. The map stays in the environment (game) frame; a binding yaw rotates lookups.
import { assertLandscapeEquirectImage } from './LandscapeSkyIrradiance.js';

const PI = Math.PI;

export const LANDSCAPE_SKY_REFLECTION = Object.freeze({
    model: 'landscape-sky-reflection-ggx-v1',
    width: 128,
    height: 64,
    // the GGX lobe of the Cox-Munk 3 m/s sea keeps 98.8% of its split-sum weight within 60° of the reflection direction
    supportDegrees: 60,
    estimator: 'split-sum prefilter with V = N = R: ∫ L(l) D(h) (n·l) dl / ∫ D(h) (n·l) dl over the environment texels (the three.js PMREM GGX estimator)',
    mapping: 'equirectangular in the environment (game) frame: u = atan2(z, x) / 2π + 0.5, v = asin(y) / π + 0.5; the first row is the nadir'
});

/**
 * GGX normal distribution of the half vector between a reflection direction and a light direction an angle θ apart (V = N = R).
 * @param {number} cosine cos θ @param {number} alpha GGX alpha (roughness²) @returns {number}
 */
export function landscapeSkyReflectionDistribution(cosine, alpha) {
    const a2 = alpha * alpha, nh2 = (1 + cosine) / 2, denominator = nh2 * (a2 - 1) + 1;
    return a2 / (PI * denominator * denominator);
}

/**
 * @param {import('./LandscapeSkyIrradiance.js').LandscapeEquirectImage} input linear radiance, three.js equirectangular, rows from +Y down
 * @param {{roughness:number,width?:number,height?:number,supportDegrees?:number,intensity?:number}} options roughness is the perceptual GGX
 *   roughness (alpha = roughness²); intensity scales the environment like the game's envMapIntensity
 * @returns {Readonly<{model:string,width:number,height:number,data:Float32Array,roughness:number,alpha:number,supportDegrees:number,retainedWeight:number}>}
 *   RGBA radiance rows from the nadir up (alpha 1); retainedWeight is the share of the full-hemisphere GGX weight inside the support at the equator
 */
export function prefilterLandscapeSkyReflection(input, { roughness, width = LANDSCAPE_SKY_REFLECTION.width, height = LANDSCAPE_SKY_REFLECTION.height,
    supportDegrees = LANDSCAPE_SKY_REFLECTION.supportDegrees, intensity = 1 } = /** @type {any} */ ({})) {
    const image = assertLandscapeEquirectImage(input);
    if (!(roughness > 0 && roughness <= 1)) throw new Error(`[Landscape] The sky reflection roughness must lie in (0, 1]; received ${roughness}`);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 8 || height < 4 || width !== 2 * height) throw new Error(`[Landscape] The sky reflection map must be a 2:1 grid of at least 8×4; received ${width}×${height}`);
    if (image.width < width || image.height < height) throw new Error(`[Landscape] The ${image.width}×${image.height} environment is smaller than the ${width}×${height} reflection map`);
    if (!(supportDegrees > 0 && supportDegrees <= 90)) throw new Error(`[Landscape] The reflection support must lie in (0°, 90°]; received ${supportDegrees}`);
    if (!(intensity >= 0 && Number.isFinite(intensity))) throw new Error(`[Landscape] The environment intensity must be finite and non-negative; received ${intensity}`);
    const alpha = roughness * roughness, minimumCosine = Math.cos(supportDegrees * PI / 180);
    // 1. solid-angle weighted environment means on the output grid, rows from the nadir up
    const source = new Float64Array(width * height * 3), weights = new Float64Array(width * height);
    const { width: W, height: H, data, channels, decode } = image;
    for (let y = 0; y < H; y++) {
        const omega = (Math.sin(PI / 2 - y / H * PI) - Math.sin(PI / 2 - (y + 1) / H * PI)) * 2 * PI / W;
        const row = height - 1 - Math.min(height - 1, Math.floor((y + .5) * height / H));
        for (let x = 0, offset = y * W * channels; x < W; x++, offset += channels) {
            const cell = row * width + Math.min(width - 1, Math.floor((x + .5) * width / W));
            for (let channel = 0; channel < 3; channel++) source[cell * 3 + channel] += (decode ? decode[data[offset + channel]] : data[offset + channel]) * omega;
            weights[cell] += omega;
        }
    }
    for (let cell = 0; cell < width * height; cell++) for (let channel = 0; channel < 3; channel++) source[cell * 3 + channel] /= weights[cell];
    const rowSolidAngle = Float64Array.from({ length: height }, (_, row) => (Math.sin(-PI / 2 + (row + 1) / height * PI) - Math.sin(-PI / 2 + row / height * PI)) * 2 * PI / width);
    const elevation = row => -PI / 2 + (row + .5) / height * PI, cosines = Float64Array.from({ length: width }, (_, offset) => Math.cos(offset / width * 2 * PI));
    // 2. per output row: the (source row, azimuth offset, weight) entries within the support, then 3. the gather
    const output = new Float32Array(width * height * 4), accumulator = new Float64Array(width * 3);
    let retainedWeight = 1;
    for (let row = 0; row < height; row++) {
        const sinOut = Math.sin(elevation(row)), cosOut = Math.cos(elevation(row)), entryRows = [], entryOffsets = [], entryWeights = [];
        let total = 0, hemisphere = 0;
        for (let sourceRow = 0; sourceRow < height; sourceRow++) {
            const sinIn = Math.sin(elevation(sourceRow)), cosIn = Math.cos(elevation(sourceRow)), omega = rowSolidAngle[sourceRow];
            for (let offset = 0; offset < width; offset++) {
                const cosine = cosOut * cosIn * cosines[offset] + sinOut * sinIn;
                if (cosine <= 0) continue;
                const weight = landscapeSkyReflectionDistribution(cosine, alpha) * cosine * omega;
                hemisphere += weight;
                if (cosine <= minimumCosine) continue;
                entryRows.push(sourceRow * width); entryOffsets.push(offset); entryWeights.push(weight);
                total += weight;
            }
        }
        if (row === height / 2) retainedWeight = total / hemisphere;
        // every entry adds its source row, shifted by its azimuth offset, to the whole output row
        accumulator.fill(0);
        for (let entry = 0; entry < entryWeights.length; entry++) {
            const weight = entryWeights[entry] / total, base = entryRows[entry] * 3, offset = entryOffsets[entry], split = (width - offset) * 3, shift = offset * 3;
            for (let index = 0; index < split; index++) accumulator[index] += source[base + shift + index] * weight;
            for (let index = split; index < width * 3; index++) accumulator[index] += source[base + index - split] * weight;
        }
        for (let column = 0; column < width; column++) {
            const target = (row * width + column) * 4;
            output[target] = accumulator[column * 3] * intensity; output[target + 1] = accumulator[column * 3 + 1] * intensity;
            output[target + 2] = accumulator[column * 3 + 2] * intensity; output[target + 3] = 1;
        }
    }
    return Object.freeze({ model: LANDSCAPE_SKY_REFLECTION.model, width, height, data: output, roughness, alpha, supportDegrees, retainedWeight });
}

/**
 * Bilinear lookup of a prefiltered map along a direction in its frame, as the water shader samples it (u wraps, v clamps).
 * @param {{width:number,height:number,data:Float32Array|ArrayLike<number>}} map @param {ArrayLike<number>} direction unit vector @returns {number[]}
 */
export function sampleLandscapeSkyReflection(map, direction) {
    const [x, y, z] = direction, u = Math.atan2(z, x) / (2 * PI) + .5, v = Math.asin(Math.max(-1, Math.min(1, y))) / PI + .5;
    const fx = u * map.width - .5, fy = Math.max(0, Math.min(map.height - 1, v * map.height - .5));
    const x0 = Math.floor(fx), y0 = Math.min(map.height - 2, Math.floor(fy)), tx = fx - x0, ty = Math.max(0, Math.min(1, fy - y0));
    const column = value => ((value % map.width) + map.width) % map.width;
    const texel = (cx, cy) => [0, 1, 2].map(channel => Number(map.data[(cy * map.width + column(cx)) * 4 + channel]));
    const a = texel(x0, y0), b = texel(x0 + 1, y0), c = texel(x0, y0 + 1), d = texel(x0 + 1, y0 + 1);
    return [0, 1, 2].map(channel => (a[channel] * (1 - tx) + b[channel] * tx) * (1 - ty) + (c[channel] * (1 - tx) + d[channel] * tx) * ty);
}
