// Spectral wave model of the animated ocean (AI 597): finite-depth dispersion, JONSWAP and TMA, directional spreading, the cascade spectra, the FFT butterfly table and exact JavaScript mirrors of the GPU passes.
// @ts-check
// Design. The open sea is the sum of band-limited cascades, each a periodic patch of length L evolved from an initial spectrum h0(k) with the
// finite-depth dispersion w^2 = g k tanh(k h) (Tessendorf 2004, "Simulating Ocean Water", eq. for h(k, t)). The wave-vector spectrum of each
// cascade is the directional frequency spectrum of a JONSWAP wind sea (Hasselmann et al. 1973: alpha and the peak frequency from the wind speed
// and the fetch) under the TMA finite-depth factor (Bouws, Günther, Rosenthal & Vincent 1985) and the Mitsuyasu cos^2s spreading (Mitsuyasu et al.
// 1975; Longuet-Higgins normalization), plus a narrow swell (gamma 7) calibrated to its significant height, converted to wave-vector density by
// E(k) = S(w) D(theta) (dw/dk) / k. The initial amplitudes are |h0(k)|^2 = E(k) dk^2 / 2 so the discrete variance of the real surface equals m0 and
// Hs = 4 sqrt(m0) holds by construction. The random phases come from an integer hash of the texel and the preset seed (deterministic on every
// device), turned into a Gaussian pair by Box-Muller. The GPU passes (ocean_spectrum_init, ocean_spectrum_time, ocean_fft) are mirrored here
// function by function so unit tests pin the math the shaders carry; the butterfly table is the one the shader reads.
import { LANDSCAPE_OCEAN, LANDSCAPE_OCEAN_SEA_STATES, landscapeOceanCascades, landscapeOceanSeaState } from './LandscapeOceanModel.js';

const G = LANDSCAPE_OCEAN.gravity;
const TWO_PI = 2 * Math.PI;
// Lanczos approximation of ln Gamma (g = 7, 9 coefficients), the one the init shader carries
const LANCZOS = Object.freeze([0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]);

/** @param {number} x @returns {number} ln Gamma(x) for x > 0 (Lanczos, g = 7) */
export function landscapeOceanLogGamma(x) {
    if (!(x > 0)) throw new Error(`[LandscapeOcean] ln Gamma needs a positive argument; received ${x}`);
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - landscapeOceanLogGamma(1 - x);
    const z = x - 1;
    let sum = LANCZOS[0];
    for (let i = 1; i < 9; i++) sum += LANCZOS[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(TWO_PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/**
 * Finite-depth dispersion: the angular frequency and group velocity of wavenumber k (rad/m) over depth h (m).
 * @param {number} k @param {number} depth @returns {{omega:number,groupVelocity:number}}
 */
export function landscapeOceanDispersion(k, depth) {
    if (!(k >= 0) || !(depth > 0)) throw new Error(`[LandscapeOcean] Dispersion needs k >= 0 and a positive depth; received ${k}, ${depth}`);
    if (k === 0) return { omega: 0, groupVelocity: Math.sqrt(G * depth) };
    const kh = k * depth, th = Math.tanh(kh), omega = Math.sqrt(G * k * th);
    return { omega, groupVelocity: G * (th + kh * (1 - th * th)) / (2 * omega) };
}

/**
 * JONSWAP frequency spectrum S(w) (m^2 s) with Phillips constant alpha, peak frequency wp (rad/s) and peak enhancement gamma.
 * @param {number} omega @param {{alpha:number,omegaPeak:number,gamma:number}} shape
 */
export function landscapeOceanJonswap(omega, { alpha, omegaPeak, gamma }) {
    if (!(omega > 0)) return 0;
    const sigma = omega <= omegaPeak ? 0.07 : 0.09, r = Math.exp(-((omega - omegaPeak) ** 2) / (2 * sigma * sigma * omegaPeak * omegaPeak));
    return alpha * G * G / omega ** 5 * Math.exp(-1.25 * (omegaPeak / omega) ** 4) * gamma ** r;
}

/** TMA finite-depth factor of a frequency (rad/s) over depth h (m). @param {number} omega @param {number} depth */
export function landscapeOceanTma(omega, depth) {
    const wh = omega * Math.sqrt(depth / G);
    return wh <= 1 ? 0.5 * wh * wh : wh < 2 ? 1 - 0.5 * (2 - wh) ** 2 : 1;
}

/**
 * Mitsuyasu directional spreading D(theta) of a frequency about a heading, normalized over the full circle: cos^2s(delta / 2) = ((1 + cos delta) / 2)^s with s from the
 * peak spread sp as (w/wp)^5 below the peak and (w/wp)^-2.5 above it, floored so the normalization stays finite.
 * @param {number} theta direction angle (radians, the wave's travel direction) @param {number} omega @param {{omegaPeak:number,spreadPeak:number,heading:number}} shape heading in radians
 */
export function landscapeOceanSpreading(theta, omega, { omegaPeak, spreadPeak, heading }) {
    const ratio = Math.max(omega, 1e-6) / omegaPeak, s = Math.max(0.1, Math.min(60, spreadPeak * (ratio <= 1 ? ratio ** 5 : ratio ** -2.5)));
    const normalization = Math.exp(landscapeOceanLogGamma(s + 1) - landscapeOceanLogGamma(s + 0.5)) / (2 * Math.sqrt(Math.PI));
    return normalization * Math.pow(0.5 * (1 + Math.cos(theta - heading)), s);
}

/** @param {number} headingDegrees landscape heading (clockwise from north, +Z) @returns {number} direction angle atan2(z, x) in radians */
export function landscapeOceanHeadingAngle(headingDegrees) {
    const radians = headingDegrees * Math.PI / 180;
    return Math.atan2(Math.cos(radians), Math.sin(radians));
}

/**
 * The spectral shapes of a sea-state preset: the JONSWAP wind sea (alpha and peak frequency from the 10 m wind speed and the fetch, the Mitsuyasu
 * peak spread) and the swell (a narrow JONSWAP whose alpha is calibrated numerically so its deep-water Hs matches the preset), each with its
 * travel direction angle.
 * @param {string} seaState
 * @returns {Readonly<{id:string,depthMeters:number,wind:Readonly<{alpha:number,omegaPeak:number,gamma:number,spreadPeak:number,heading:number,speed:number}>,swell:Readonly<{alpha:number,omegaPeak:number,gamma:number,spreadPeak:number,heading:number}>,choppiness:ReadonlyArray<number>,seed:number}>}
 */
export function landscapeOceanSeaStateShapes(seaState) {
    const id = landscapeOceanSeaState(seaState), preset = LANDSCAPE_OCEAN_SEA_STATES[id];
    const speed = preset.wind.speedMetersPerSecond, fetch = preset.wind.fetchKilometres * 1000;
    const omegaPeak = 22 * Math.cbrt(G * G / (speed * fetch)), alpha = 0.076 * Math.pow(speed * speed / (fetch * G), 0.22);
    const spreadPeak = 11.5 * Math.pow(omegaPeak * speed / G, -2.5);
    const wind = Object.freeze({ alpha, omegaPeak, gamma: preset.gamma, spreadPeak: Math.max(1, Math.min(60, spreadPeak)), heading: landscapeOceanHeadingAngle(preset.wind.headingDegrees), speed });
    const swellPeak = TWO_PI / preset.swell.periodSeconds, swellShape = { alpha: 1, omegaPeak: swellPeak, gamma: 7 };
    const unitVariance = landscapeOceanFrequencyVariance(omega => landscapeOceanJonswap(omega, swellShape), swellPeak);
    const swellAlpha = (preset.swell.heightMeters / 4) ** 2 / unitVariance;
    const swell = Object.freeze({ alpha: swellAlpha, omegaPeak: swellPeak, gamma: 7, spreadPeak: preset.swell.spread, heading: landscapeOceanHeadingAngle(preset.swell.headingDegrees) });
    return Object.freeze({ id, depthMeters: preset.depthMeters, wind, swell, choppiness: preset.choppiness, seed: preset.seed });
}

/**
 * Integral of a frequency spectrum over 0 < w < 8 wp by the midpoint rule on a fine grid (m0 of that spectrum).
 * @param {(omega:number) => number} spectrum @param {number} omegaPeak
 */
export function landscapeOceanFrequencyVariance(spectrum, omegaPeak) {
    const steps = 4000, upper = 8 * omegaPeak, d = upper / steps;
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += spectrum((i + 0.5) * d) * d;
    return sum;
}

/**
 * Wave-vector spectral density E(kx, kz) (m^2 per (rad/m)^2) of the wind sea plus the swell at the representative depth: S(w) TMA(w) D(theta) cg / k.
 * The mirror of oceanSpectrum in ocean_spectrum_init.frag.glsl.
 * @param {number} kx @param {number} kz @param {ReturnType<typeof landscapeOceanSeaStateShapes>} shapes
 */
export function landscapeOceanWaveSpectrum(kx, kz, shapes) {
    const k = Math.hypot(kx, kz);
    if (!(k > 0)) return 0;
    const { omega, groupVelocity } = landscapeOceanDispersion(k, shapes.depthMeters), theta = Math.atan2(kz, kx), tma = landscapeOceanTma(omega, shapes.depthMeters);
    const wind = landscapeOceanJonswap(omega, shapes.wind) * landscapeOceanSpreading(theta, omega, shapes.wind);
    const swell = landscapeOceanJonswap(omega, shapes.swell) * landscapeOceanSpreading(theta, omega, shapes.swell);
    return (wind + swell) * tma * groupVelocity / k;
}

/**
 * Deterministic 32-bit hash of a texel and a seed (the shader's oceanHash: three rounds of multiply-xorshift on uint arithmetic).
 * @param {number} x @param {number} y @param {number} seed @returns {number} unsigned 32-bit
 */
export function landscapeOceanHash(x, y, seed) {
    let h = (Math.imul(x >>> 0, 0x9E3779B1) ^ Math.imul((y >>> 0) + 0x7F4A7C15, 0x85EBCA77) ^ Math.imul((seed >>> 0) + 0x165667B1, 0xC2B2AE3D)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297A2D39) >>> 0;
    return (h ^ (h >>> 15)) >>> 0;
}

/**
 * A standard Gaussian pair of a texel (Box-Muller over two hashes), the mirror of oceanGaussian in the init shader.
 * @param {number} x @param {number} y @param {number} seed @returns {[number, number]}
 */
export function landscapeOceanGaussian(x, y, seed) {
    const u1 = (landscapeOceanHash(x, y, seed) + 0.5) / 4294967296, u2 = (landscapeOceanHash(x, y, seed + 0x51ED27) + 0.5) / 4294967296;
    const radius = Math.sqrt(-2 * Math.log(u1)), angle = TWO_PI * u2;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

/**
 * The initial spectrum texel of cascade c at texel (m, n) (0..texels - 1): h0(k) and conj h0(-k) for k = 2 pi (m - N/2, n - N/2) / L, band-limited
 * to the cascade's (kMin, kMax]; the Nyquist row and column and k = 0 hold zero. Mirror of ocean_spectrum_init.frag.glsl.
 * @param {number} m @param {number} n @param {{lengthMeters:number,kMin:number,kMax:number,index:number}} cascade @param {number} texels
 * @param {ReturnType<typeof landscapeOceanSeaStateShapes>} shapes
 * @returns {[number, number, number, number]} h0 re, h0 im, conj h0(-k) re, conj h0(-k) im
 */
export function landscapeOceanInitialTexel(m, n, cascade, texels, shapes) {
    const half = texels / 2, dk = TWO_PI / cascade.lengthMeters, seed = shapes.seed * 1000 + cascade.index;
    const amplitude = (i, j) => {
        if (i === -half || j === -half || (i === 0 && j === 0)) return 0;
        const kx = i * dk, kz = j * dk, k = Math.hypot(kx, kz);
        if (!(k > cascade.kMin && k <= cascade.kMax)) return 0;
        return Math.sqrt(landscapeOceanWaveSpectrum(kx, kz, shapes) * dk * dk / 2);
    };
    const i = m - half, j = n - half, a = amplitude(i, j), b = amplitude(-i, -j);
    const [gr, gi] = landscapeOceanGaussian(m, n, seed), [hr, hi] = landscapeOceanGaussian(half - i, half - j, seed);
    const scale = Math.SQRT1_2;
    return [scale * gr * a, scale * gi * a, scale * hr * b, 0 - scale * hi * b];
}

/**
 * The evolved spectrum texel packed for the FFT at time t: A = h(k, t) + i Dx(k, t) and B = Dz(k, t) with h = h0 e^{iwt} + conj h0(-k) e^{-iwt},
 * Dx = -i (kx / k) h and Dz = -i (kz / k) h (unit choppiness; the final pass scales it). Mirror of ocean_spectrum_time.frag.glsl.
 * @param {[number, number, number, number]} initial @param {number} kx @param {number} kz @param {number} depth @param {number} time
 * @returns {[number, number, number, number]} A re, A im, B re, B im
 */
export function landscapeOceanEvolvedTexel(initial, kx, kz, depth, time) {
    const k = Math.hypot(kx, kz);
    if (!(k > 0)) return [0, 0, 0, 0];
    const { omega } = landscapeOceanDispersion(k, depth), c = Math.cos(omega * time), s = Math.sin(omega * time);
    const [ar, ai, br, bi] = initial;
    const hr = ar * c - ai * s + br * c + bi * s, hi = ar * s + ai * c - br * s + bi * c;
    const ux = kx / k, uz = kz / k;
    return [hr + ux * hr, hi + ux * hi, uz * hi, -uz * hr];
}

/**
 * The butterfly table of a radix-2 decimation-in-time inverse FFT of N points as the shader reads it: per stage s and index i, the twiddle
 * e^{+2 pi i k / N} (re, im) and the two source indices (top wing: i and i + 2^s; bottom wing: i - 2^s and i), stage 0 bit-reversed.
 * @param {number} texels N, a power of two @returns {Float32Array} stages x N x 4 (stage-major rows)
 */
export function landscapeOceanButterfly(texels) {
    const stages = Math.log2(texels);
    if (!Number.isInteger(stages) || texels < 2) throw new Error(`[LandscapeOcean] The FFT size must be a power of two; received ${texels}`);
    const reverse = index => { let r = 0; for (let b = 0; b < stages; b++) r = (r << 1) | ((index >> b) & 1); return r; };
    const table = new Float32Array(stages * texels * 4);
    for (let stage = 0; stage < stages; stage++) {
        const span = 1 << stage, group = span * 2;
        for (let i = 0; i < texels; i++) {
            const top = i % group < span, k = (i * (texels / group)) % texels, angle = TWO_PI * k / texels;
            let first = top ? i : i - span, second = top ? i + span : i;
            if (stage === 0) { first = reverse(first); second = reverse(second); }
            const o = (stage * texels + i) * 4;
            table[o] = Math.cos(angle); table[o + 1] = Math.sin(angle); table[o + 2] = first; table[o + 3] = second;
        }
    }
    return table;
}

/**
 * Inverse DFT of one complex row by the butterfly table, the arithmetic of one ocean_fft stage per pass: X[n] = sum_k x[k] e^{+2 pi i k n / N}.
 * @param {Float64Array|number[]} re @param {Float64Array|number[]} im @param {Float32Array} table @param {number} texels
 * @returns {{re:Float64Array,im:Float64Array}}
 */
export function landscapeOceanInverseFftRow(re, im, table, texels) {
    const stages = Math.log2(texels);
    let currentRe = Float64Array.from(re), currentIm = Float64Array.from(im);
    for (let stage = 0; stage < stages; stage++) {
        const nextRe = new Float64Array(texels), nextIm = new Float64Array(texels);
        for (let i = 0; i < texels; i++) {
            const o = (stage * texels + i) * 4, wr = table[o], wi = table[o + 1], p = table[o + 2], q = table[o + 3];
            nextRe[i] = currentRe[p] + wr * currentRe[q] - wi * currentIm[q];
            nextIm[i] = currentIm[p] + wr * currentIm[q] + wi * currentRe[q];
        }
        currentRe = nextRe; currentIm = nextIm;
    }
    return { re: currentRe, im: currentIm };
}

/**
 * Significant wave height of a sea state's wave-vector spectrum on one cascade grid (the discrete m0 the simulation carries: twice the summed
 * initial amplitudes squared) and of the continuous spectrum (4 sqrt of the frequency integral at the representative depth), for snapshots and tests.
 * @param {string} seaState @param {string} quality
 * @returns {{continuousMeters:number,discreteMeters:number,perCascadeMeters:number[]}}
 */
export function landscapeOceanSignificantWaveHeight(seaState, quality) {
    const shapes = landscapeOceanSeaStateShapes(seaState), cascades = landscapeOceanCascades(quality);
    const windVariance = landscapeOceanFrequencyVariance(omega => landscapeOceanJonswap(omega, shapes.wind) * landscapeOceanTma(omega, shapes.depthMeters), shapes.wind.omegaPeak);
    const swellVariance = landscapeOceanFrequencyVariance(omega => landscapeOceanJonswap(omega, shapes.swell) * landscapeOceanTma(omega, shapes.depthMeters), shapes.swell.omegaPeak);
    const texels = 64, perCascadeMeters = cascades.map(cascade => {
        // a 64-texel lattice of the same patch has the same dk and spans the band (kMax = N / 8 dk <= 32 dk), so its sum is the simulation's own
        const dk = TWO_PI / cascade.lengthMeters, half = texels / 2;
        let variance = 0;
        for (let i = -half + 1; i < half; i++) for (let j = -half + 1; j < half; j++) {
            const kx = i * dk, kz = j * dk, k = Math.hypot(kx, kz);
            if (k > cascade.kMin && k <= cascade.kMax) variance += landscapeOceanWaveSpectrum(kx, kz, shapes) * dk * dk;
        }
        return 4 * Math.sqrt(variance);
    });
    return { continuousMeters: 4 * Math.sqrt(windVariance + swellVariance), discreteMeters: 4 * Math.sqrt(perCascadeMeters.reduce((sum, hs) => sum + (hs / 4) ** 2, 0)), perCascadeMeters };
}

/**
 * Per-channel statistics of an interleaved raster (count, mean, rms, min, max, nonfinite): the measurement the GPU read-backs are judged by.
 * @param {ArrayLike<number>} values @param {number} stride channels per texel
 * @returns {Array<{mean:number,rms:number,min:number,max:number,nonfinite:number}>}
 */
export function landscapeOceanRasterStatistics(values, stride) {
    if (!Number.isInteger(stride) || stride < 1 || values.length % stride) throw new Error(`[LandscapeOcean] Raster statistics need a positive stride dividing the length; received ${stride} over ${values.length}`);
    const count = values.length / stride, channels = [];
    for (let channel = 0; channel < stride; channel++) {
        let sum = 0, square = 0, min = Infinity, max = -Infinity, nonfinite = 0;
        for (let i = channel; i < values.length; i += stride) {
            const value = values[i];
            if (!Number.isFinite(value)) { nonfinite++; continue; }
            sum += value; square += value * value;
            if (value < min) min = value;
            if (value > max) max = value;
        }
        const finite = count - nonfinite;
        channels.push({ mean: finite ? sum / finite : NaN, rms: finite ? Math.sqrt(square / finite) : NaN, min, max, nonfinite });
    }
    return channels;
}
