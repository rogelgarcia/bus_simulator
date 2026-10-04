// Evaluates deterministic world-anchored 2D gradient noise for generated landscape surface detail.
// @ts-check
// Only IEEE-754 basic arithmetic, Math.floor and Math.imul are used, with literal gradient and rotation tables: no
// trigonometry, Math.random or implementation-approximated functions, so Node and browser workers produce identical
// bits. Gradients are unit vectors, so the quintic-faded lattice value is bounded by sqrt(1/2) at a cell center; the
// normalization stays just below sqrt(2) and every octave value is strictly inside (-1, 1). Each octave is salted,
// offset by a salt-derived lattice fraction and rotated by a Pythagorean angle so octaves never share lattice zeros.

export const LANDSCAPE_SURFACE_NOISE = Object.freeze({
    id: 'landscape-gradient-noise-v1',
    lattice: 'murmur-mixed-integer-hash',
    directions: 16,
    fade: 'quintic',
    normalization: 1.4142135,
    bound: 1
});

const GRADIENT_X = new Float64Array([1, .9238795325112867, .7071067811865476, .3826834323650898, 0, -.3826834323650898, -.7071067811865476, -.9238795325112867,
    -1, -.9238795325112867, -.7071067811865476, -.3826834323650898, 0, .3826834323650898, .7071067811865476, .9238795325112867]);
const GRADIENT_Z = new Float64Array([0, .3826834323650898, .7071067811865476, .9238795325112867, 1, .9238795325112867, .7071067811865476, .3826834323650898,
    0, -.3826834323650898, -.7071067811865476, -.9238795325112867, -1, -.9238795325112867, -.7071067811865476, -.3826834323650898]);
const ROTATIONS = new Float64Array([1, 0, .8, .6, .38461538461538464, .9230769230769231, .96, .28, .6, .8, .28, .96]);
const NORMALIZATION = LANDSCAPE_SURFACE_NOISE.normalization;
const OCTAVE_STRIDE = 6;

function mix(value) {
    let h = Math.imul(value ^ value >>> 16, 0x85ebca6b);
    h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
    return h ^ h >>> 16;
}

function requireUint32(value, label) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error(`[LandscapeSurfaceNoise] ${label} must be an unsigned 32-bit integer`);
}

function corner(i, j, salt, dx, dz) {
    const direction = mix(Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ salt) >>> 28;
    return GRADIENT_X[direction] * dx + GRADIENT_Z[direction] * dz;
}

function lattice(u, v, salt) {
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const su = fu * fu * fu * (fu * (fu * 6 - 15) + 10), sv = fv * fv * fv * (fv * (fv * 6 - 15) + 10);
    const a = corner(i, j, salt, fu, fv), b = corner(i + 1, j, salt, fu - 1, fv);
    const c = corner(i, j + 1, salt, fu, fv - 1), d = corner(i + 1, j + 1, salt, fu - 1, fv - 1);
    const top = a + (b - a) * su;
    return (top + (c + (d - c) * su - top) * sv) * NORMALIZATION;
}

/** The murmur3 finalizer behind every lattice hash (landscapeWarpMix in GLSL). @param {number} value uint32 @returns {number} uint32 */
export function landscapeNoiseHash(value) {
    requireUint32(value, 'hash input');
    return mix(value | 0) >>> 0;
}

/** Salt for one noise component and octave of a seed. @param {number} seed @param {number} component @param {number} octave @returns {number} */
export function landscapeNoiseSalt(seed, component, octave) {
    requireUint32(seed, 'noise seed');
    requireUint32(component, 'noise component');
    requireUint32(octave, 'noise octave');
    return mix(mix(seed ^ Math.imul(component + 1, 0x9e3779b9)) ^ Math.imul(octave + 1, 0x85ebca77)) >>> 0;
}

/** One gradient-noise octave in lattice units, strictly inside (-1, 1). @param {number} u @param {number} v @param {number} salt @returns {number} */
export function landscapeLatticeNoise(u, v, salt) {
    if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error('[LandscapeSurfaceNoise] lattice coordinates must be finite');
    requireUint32(salt, 'noise salt');
    return lattice(u, v, salt | 0);
}

function requireOctaves(wavelengths, amplitudes) {
    if (!Array.isArray(wavelengths) || !Array.isArray(amplitudes) || wavelengths.length !== amplitudes.length || wavelengths.length > 16
        || !wavelengths.every(value => Number.isFinite(value) && value > 0) || !amplitudes.every(value => Number.isFinite(value) && value >= 0)) throw new Error('[LandscapeSurfaceNoise] octaves need matching positive wavelengths and nonnegative amplitudes');
}

/**
 * World-anchored fractal noise over an explicit octave list; octaves keep their recipe index for salts and rotations.
 * Optional ridged-mix shaping blends each octave value n with the folded ridge 1 - 2|n| - 1/2 (bounded by 1 + mix/2).
 * @param {{seed:number,component:number,wavelengths:number[],amplitudes:number[],minimumWavelength?:number,shaping?:'none'|'ridged-mix',ridgedMix?:number}} options
 */
export function createLandscapeNoiseOctaves({ seed, component, wavelengths, amplitudes, minimumWavelength = 0, shaping = 'none', ridgedMix = 0 }) {
    requireUint32(seed, 'noise seed');
    requireUint32(component, 'noise component');
    requireOctaves(wavelengths, amplitudes);
    if (!Number.isFinite(minimumWavelength) || minimumWavelength < 0 || !['none', 'ridged-mix'].includes(shaping) || !Number.isFinite(ridgedMix) || ridgedMix < 0 || ridgedMix > 1
        || shaping === 'none' && ridgedMix !== 0) throw new Error('[LandscapeSurfaceNoise] octave shaping must be none or ridged-mix with a mix in 0..1');
    const selected = wavelengths.map((_, index) => index).filter(index => wavelengths[index] >= minimumWavelength);
    const count = selected.length, data = new Float64Array(count * OCTAVE_STRIDE), salts = new Int32Array(count), plain = 1 - ridgedMix;
    selected.forEach((index, n) => {
        const salt = landscapeNoiseSalt(seed, component, index), rotation = index % (ROTATIONS.length / 2) * 2, offset = n * OCTAVE_STRIDE;
        data[offset] = 1 / wavelengths[index];
        data[offset + 1] = amplitudes[index];
        data[offset + 2] = ROTATIONS[rotation];
        data[offset + 3] = ROTATIONS[rotation + 1];
        data[offset + 4] = (salt & 0xffff) / 65536;
        data[offset + 5] = (salt >>> 16) / 65536;
        salts[n] = salt | 0;
    });

    function evaluate(x, z) {
        let sum = 0;
        for (let n = 0, offset = 0; n < count; n++, offset += OCTAVE_STRIDE) {
            const inverse = data[offset], cosine = data[offset + 2], sine = data[offset + 3];
            const value = lattice((cosine * x - sine * z) * inverse + data[offset + 4], (sine * x + cosine * z) * inverse + data[offset + 5], salts[n]);
            sum += data[offset + 1] * (ridgedMix === 0 ? value : plain * value + ridgedMix * (.5 - 2 * Math.abs(value)));
        }
        return sum;
    }

    const amplitude = selected.reduce((sum, index) => sum + amplitudes[index], 0) * (1 + ridgedMix / 2);
    return Object.freeze({ count, wavelengths: Object.freeze(selected.map(index => wavelengths[index])), amplitude, evaluate });
}

/**
 * Two-component world-anchored warp that is exactly portable to GLSL (chunks/landscape/surface_warp.glsl): uint lattice
 * hashing with wraparound multiplies, the literal gradient table, quintic fade, per-octave salts and an odd quintic
 * shaping n(15 - 10n^2 + 3n^4)/8 that keeps |n| <= 1 while raising mid-range values. Uniform arrays carry the octaves.
 * @param {{seed:number,wavelengths:number[],amplitudes:number[],shaping?:'none'|'quintic-odd'}} options
 */
export function createLandscapeSurfaceWarp({ seed, wavelengths, amplitudes, shaping = 'none' }) {
    requireUint32(seed, 'warp seed');
    requireOctaves(wavelengths, amplitudes);
    if (!['none', 'quintic-odd'].includes(shaping)) throw new Error('[LandscapeSurfaceNoise] warp shaping must be none or quintic-odd');
    const count = wavelengths.length, waves = new Float64Array(count * 4), offsets = new Float64Array(count * 4), salts = new Int32Array(count * 2), quintic = shaping === 'quintic-odd';
    for (let k = 0; k < count; k++) {
        const saltX = landscapeNoiseSalt(seed, 0, k), saltZ = landscapeNoiseSalt(seed, 1, k), rotation = k % (ROTATIONS.length / 2) * 2;
        waves[k * 4] = 1 / wavelengths[k]; waves[k * 4 + 1] = amplitudes[k]; waves[k * 4 + 2] = ROTATIONS[rotation]; waves[k * 4 + 3] = ROTATIONS[rotation + 1];
        offsets[k * 4] = (saltX & 0xffff) / 65536; offsets[k * 4 + 1] = (saltX >>> 16) / 65536; offsets[k * 4 + 2] = (saltZ & 0xffff) / 65536; offsets[k * 4 + 3] = (saltZ >>> 16) / 65536;
        salts[k * 2] = saltX | 0; salts[k * 2 + 1] = saltZ | 0;
    }

    /** @param {number} x @param {number} z @param {Float64Array} out receives [warpX, warpZ] in meters */
    function evaluate(x, z, out) {
        let warpX = 0, warpZ = 0;
        for (let k = 0, w = 0, s = 0; k < count; k++, w += 4, s += 2) {
            const inverse = waves[w], cosine = waves[w + 2], sine = waves[w + 3];
            const u = (cosine * x - sine * z) * inverse, v = (sine * x + cosine * z) * inverse;
            let nx = lattice(u + offsets[w], v + offsets[w + 1], salts[s]), nz = lattice(u + offsets[w + 2], v + offsets[w + 3], salts[s + 1]);
            if (quintic) { nx = nx * (15 - 10 * nx * nx + 3 * nx * nx * nx * nx) / 8; nz = nz * (15 - 10 * nz * nz + 3 * nz * nz * nz * nz) / 8; }
            warpX += waves[w + 1] * nx; warpZ += waves[w + 1] * nz;
        }
        out[0] = warpX; out[1] = warpZ;
        return out;
    }

    return Object.freeze({ count, shaping, maxDisplacement: amplitudes.reduce((sum, amplitude) => sum + amplitude, 0), evaluate,
        uniforms: Object.freeze({ octaves: count, waves: Float32Array.from(waves), offsets: Float32Array.from(offsets), salts: Int32Array.from(salts) }) });
}
