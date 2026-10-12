// Shore-wave model of the animated ocean (AI 597 D2): the signed shore distance of a depth raster, the finite-depth phase speed of a period, and the travel time, shoaled height and breaking mask of a plane swell marched over the seabed.
// @ts-check
// Design. The open sea's spectral cascades stop at the depth fade; from there to the beach the water carries one monochromatic swell (the
// preset's period and height, arriving along its heading) refracted and shoaled over the bathymetry raster of LandscapeOceanField.js. Its
// travel time T solves the eikonal equation |grad T| = 1 / c(h) with the phase speed c of the period at the local depth (the dispersion of
// LandscapeOceanSpectrum.js inverted by a bracketed Newton iteration) through the fast marching method (Sethian 1996): every water texel at
// least deepDepthMeters deep is a frozen plane-wave source, land is a wall, and the march pops a binary heap ordered by (T, index) so the result
// repeats on every run and device. The wave height follows the energy flux E = H^2 cg along the march (the finite-depth shoaling of Dean &
// Dalrymple 1991, ch. 4): a texel inherits the flux of its upwind neighbours weighted by their time lag (the first-order upwind transport along
// the characteristic, so a shadow spreads sideways like diffraction instead of running down a grid-aligned corridor) and is capped at the
// depth-limited breaking height gamma h (McCowan 1894; gamma 0.78), so a bar or a reef shadows the water behind it and the capped texels are the
// breaking mask the foam reads; rock platforms surge instead of breaking and keep their flux. The signed shore distance (an exact two-pass squared Euclidean distance transform,
// Felzenszwalb & Huttenlocher 2012) gives the beach normal to the crest-angle statistic and to the swash. The computation is pure and
// synchronous; computeLandscapeOceanShore drives the same march in slices that yield to the event loop so a browser frame loop stays alive,
// bit for bit the same result. The GPU samples these rasters bilinearly and keys land on the depth channel, so before the upload the owner
// extends the shoreline values over the sentinel texels (landscapeOceanShoreFill, a deterministic breadth-first fill) and no 1e9 ever bleeds
// into the water. Rasters follow LandscapeOceanField.js: texels x texels, row 0 at the minimum z, column 0 at the minimum x, texel centres at
// min + (i + 0.5) texelMeters, depth positive below sea level and negative over land (land = depth <= 0).
import { LANDSCAPE_OCEAN } from './LandscapeOceanModel.js';
import { landscapeOceanDispersion } from './LandscapeOceanSpectrum.js';

const G = LANDSCAPE_OCEAN.gravity;
const TWO_PI = 2 * Math.PI;
// the "no site in this line" value of the distance transform: far above any squared texel distance, finite so the parabola arithmetic stays finite
const EDT_INFINITY = 1e20;
const FAR = 0, NARROW = 1, ACCEPTED = 2, LAND = 3;

export const LANDSCAPE_OCEAN_SHORE = Object.freeze({
    id: 'landscape-ocean-shore-v1',
    // the travel time stored on land and on water the march never reaches (+Infinity in the model; finite so the raster uploads as a texture)
    travelTimeSentinel: 1e9,
    // the phase speed and group velocity of shallower water are those of this depth
    minDepthMeters: .05,
    // depth-limited breaking index H / h (McCowan)
    defaultGamma: .78,
    // default source depth as a fraction of the deep-water wavelength g T^2 / 2 pi
    deepDepthWavelengths: .5,
    // when no water texel reaches the source depth, the deepest fraction of the water texels is the source
    fallbackSourceFraction: .01,
    // accepted texels between two yields of the asynchronous driver
    yieldEvery: 65536
});

/**
 * @typedef {object} LandscapeOceanShoreInput
 * @property {ArrayLike<number>} depth texels x texels depth raster (m, positive below sea level, land <= 0), row 0 at the minimum z
 * @property {number} texels texels per side
 * @property {number} texelMeters texel size (m)
 * @property {number} periodSeconds swell period
 * @property {number} heightMeters swell height at the sources
 * @property {number} headingDegrees landscape heading the swell travels toward (clockwise from north, +z): direction (sin h, cos h) in (x, z)
 * @property {number} [deepDepthMeters] source depth (default half the deep-water wavelength)
 * @property {number} [gamma] breaking index (default 0.78)
 * @property {Uint8Array|null} [rock] 1 where the seabed is a rock platform or a bluff toe: never capped, never breaking
 * @property {Float32Array|null} [shoreDistance] the raster's signed shore distance when already known (landscapeOceanShoreDistance otherwise)
 * @property {Uint8Array|null} [crestMask] 1 on the texels the crest-angle statistic may use (the beach zones); every breaking texel when absent
 */

/**
 * @typedef {object} LandscapeOceanShoreStatistics
 * @property {number} sources frozen plane-wave texels
 * @property {number} water water texels of the raster
 * @property {number} visited water texels accepted by the march (water - sources - visited is the water the swell never reaches)
 * @property {number} deepDepthMeters the source depth in effect (the fallback's threshold when no texel reached the requested depth)
 * @property {number} breakingTexels texels whose flux was capped
 * @property {{median:number,p10:number,p90:number}} breakingDepth depth over the breaking texels (NaN without any)
 * @property {{meanDegrees:number,p90Degrees:number,texels:number}} crestAngle the line angle (0 to 90 degrees) between the propagation direction
 *   (the gradient of the travel time) and the shore normal (the gradient of the shore distance) over the breaking texels: small = crests parallel to the beach
 */

const finite = (value, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[LandscapeOceanShore] ${label} must be a finite number; received ${String(value)}`);
    return value;
};
const positive = (value, label) => {
    if (!(finite(value, label) > 0)) throw new Error(`[LandscapeOceanShore] ${label} must be positive; received ${value}`);
    return value;
};
const requireRaster = (depth, texels, texelMeters) => {
    if (!Number.isInteger(texels) || texels < 2) throw new Error(`[LandscapeOceanShore] The raster needs at least two texels per side; received ${String(texels)}`);
    positive(texelMeters, 'the texel size');
    if (!depth || typeof depth.length !== 'number' || depth.length !== texels * texels) throw new Error(`[LandscapeOceanShore] The depth raster must hold texels x texels values (${texels * texels}); received ${depth ? String(depth.length) : String(depth)}`);
};
const requireOptionalArray = (value, constructor, length, label) => {
    if (value === null || value === undefined) return null;
    if (!(value instanceof constructor) || value.length !== length) throw new Error(`[LandscapeOceanShore] ${label} must be a ${constructor.name} of ${length} texels`);
    return value;
};

/**
 * One-dimensional squared distance transform (Felzenszwalb & Huttenlocher): d[q] = min over p of (q - p)^2 + f[p] by the lower envelope of the parabolas.
 * @param {Float64Array} f @param {Float64Array} d @param {Int32Array} v parabola vertices @param {Float64Array} z envelope boundaries (n + 1) @param {number} n
 */
function distanceTransform1d(f, d, v, z, n) {
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
        // intersection of the parabola at q with the last one of the envelope; parabolas it dominates leave the envelope
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
            k--;
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
}

/**
 * Signed Euclidean shore distance of a depth raster (m): on water the distance to the nearest land texel centre, on land minus the distance to
 * the nearest water texel centre; exact (two one-dimensional squared transforms). Without any land every value is texels x texelMeters, without any water its negative.
 * @param {ArrayLike<number>} depth @param {number} texels @param {number} texelMeters @returns {Float32Array}
 */
export function landscapeOceanShoreDistance(depth, texels, texelMeters) {
    requireRaster(depth, texels, texelMeters);
    const n = texels, N = n * n, distance = new Float32Array(N);
    let land = 0;
    for (let i = 0; i < N; i++) if (!(depth[i] > 0)) land++;
    if (land === 0) return distance.fill(n * texelMeters);
    if (land === N) return distance.fill(-n * texelMeters);
    const squared = new Float64Array(N), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const transform = sitesOnLand => {
        for (let i = 0; i < N; i++) squared[i] = (depth[i] > 0) === sitesOnLand ? EDT_INFINITY : 0;
        for (let c = 0; c < n; c++) {
            for (let r = 0; r < n; r++) f[r] = squared[r * n + c];
            distanceTransform1d(f, d, v, z, n);
            for (let r = 0; r < n; r++) squared[r * n + c] = d[r];
        }
        for (let r = 0; r < n; r++) {
            const o = r * n;
            for (let c = 0; c < n; c++) f[c] = squared[o + c];
            distanceTransform1d(f, d, v, z, n);
            for (let c = 0; c < n; c++) squared[o + c] = d[c];
        }
    };
    transform(true);
    for (let i = 0; i < N; i++) if (depth[i] > 0) distance[i] = Math.sqrt(squared[i]) * texelMeters;
    transform(false);
    for (let i = 0; i < N; i++) if (!(depth[i] > 0)) distance[i] = -Math.sqrt(squared[i]) * texelMeters;
    return distance;
}

/**
 * Extends a raster over its sentinel texels in place: every texel at or above the sentinel takes the value of the first finite (below the
 * sentinel) 4-neighbour that reaches it in breadth-first order (seeds are the finite texels in index order, a filled texel seeds its own
 * neighbours with the value it received), so the land side becomes a piecewise-constant extension of the shoreline values and no sentinel
 * remains. A raster without any finite texel is left unchanged.
 * @param {Float32Array} values texels x texels @param {number} texels @param {number} [sentinel] @returns {number} filled texels
 */
export function landscapeOceanShoreFill(values, texels, sentinel = LANDSCAPE_OCEAN_SHORE.travelTimeSentinel) {
    if (!Number.isInteger(texels) || texels < 2) throw new Error(`[LandscapeOceanShore] The raster needs at least two texels per side; received ${String(texels)}`);
    finite(sentinel, 'the sentinel');
    const n = texels, N = n * n;
    if (!(values instanceof Float32Array) || values.length !== N) throw new Error(`[LandscapeOceanShore] The fill needs a Float32Array of ${N} texels`);
    const queue = new Int32Array(N);
    let head = 0, tail = 0, filled = 0;
    for (let i = 0; i < N; i++) if (values[i] < sentinel) queue[tail++] = i;
    if (!tail) return 0;
    const fill = (j, value) => {
        if (values[j] < sentinel) return;
        values[j] = value; queue[tail++] = j; filled++;
    };
    while (head < tail) {
        const i = queue[head++], value = values[i], c = i % n;
        if (c > 0) fill(i - 1, value);
        if (c < n - 1) fill(i + 1, value);
        if (i >= n) fill(i - n, value);
        if (i + n < N) fill(i + n, value);
    }
    return filled;
}

/**
 * Smooths the land side of a filled raster in place: every land texel (depth <= 0) takes the mean of itself and its four neighbours over the
 * given passes while the water texels keep their values, so the shoreline values copied inland breadth first (Manhattan-nearest arcs) become a
 * continuous field for the AI 597 D3 foam pass on the sand (the D4 swash sheet reads its arrival at the nearest waterline texel instead).
 * Returns the number of texels smoothed per pass.
 * @param {Float32Array} values @param {ArrayLike<number>} depth @param {number} texels @param {number} [passes]
 */
export function landscapeOceanShoreSmoothLand(values, depth, texels, passes = 2) {
    if (!(values instanceof Float32Array) || values.length !== texels * texels || depth.length !== values.length) throw new Error('[LandscapeOceanShore] smoothing needs a texels x texels raster with its depth');
    if (!Number.isInteger(passes) || passes < 1) throw new Error('[LandscapeOceanShore] passes must be a positive integer; received ' + String(passes));
    const scratch = new Float32Array(values.length);
    let smoothed = 0;
    for (let pass = 0; pass < passes; pass++) {
        scratch.set(values);
        smoothed = 0;
        for (let r = 0; r < texels; r++) for (let c = 0; c < texels; c++) {
            const i = r * texels + c;
            if (depth[i] > 0) continue;
            let sum = scratch[i], count = 1;
            if (c > 0) { sum += scratch[i - 1]; count++; }
            if (c + 1 < texels) { sum += scratch[i + 1]; count++; }
            if (r > 0) { sum += scratch[i - texels]; count++; }
            if (r + 1 < texels) { sum += scratch[i + texels]; count++; }
            values[i] = sum / count;
            smoothed++;
        }
    }
    return smoothed;
}

/**
 * The wavenumber, phase speed and group velocity of a period over a depth: w^2 = g k tanh(k h) inverted for k (the GPU side carries the same
 * iteration). In the dimensionless form y tanh y = x^2 with y = k h and x = w sqrt(h / g), y lies between max(x, x^2) and (x^2 + sqrt(x^4 + 4 x^2)) / 2
 * (tanh y <= min(1, y) and tanh y >= y / (1 + y)); Guo's 2002 closed form starts the Newton iteration and the bracket guards every step.
 * @param {number} periodSeconds @param {number} depth m, positive
 * @returns {{k:number,c:number,cg:number}} wavenumber (rad/m), phase speed and group velocity (m/s)
 */
export function landscapeOceanPhaseSpeed(periodSeconds, depth) {
    positive(periodSeconds, 'the period'); positive(depth, 'the depth');
    const omega = TWO_PI / periodSeconds, x = omega * Math.sqrt(depth / G), x2 = x * x;
    let low = Math.max(x, x2), high = 0.5 * (x2 + Math.sqrt(x2 * x2 + 4 * x2));
    let y = Math.min(high, Math.max(low, x2 * Math.pow(1 - Math.exp(-Math.pow(x, 2.5)), -0.4)));
    for (let iteration = 0; iteration < 64; iteration++) {
        const th = Math.tanh(y), residual = y * th - x2;
        if (residual > 0) high = y; else low = y;
        let next = y - residual / (th + y * (1 - th * th));
        if (!(next > low && next < high)) next = 0.5 * (low + high);
        const converged = Math.abs(next - y) <= 1e-14 * y;
        y = next;
        if (converged) break;
    }
    const k = y / depth;
    return { k, c: omega / k, cg: landscapeOceanDispersion(k, depth).groupVelocity };
}

/** Linear-interpolated quantile of sorted values (NaN when empty). @param {Float64Array} sorted @param {number} p */
function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const position = p * (sorted.length - 1), index = Math.floor(position), fraction = position - index;
    return index + 1 < sorted.length ? sorted[index] * (1 - fraction) + sorted[index + 1] * fraction : sorted[index];
}

/**
 * The march over one raster: validates the input, tabulates the speeds, freezes the plane-wave sources, then accepts texels from the heap in
 * slices (advance) and assembles the rasters and the statistics (finish). The synchronous and the yielding driver share it.
 * @param {LandscapeOceanShoreInput} input
 */
function createShoreMarch(input) {
    const n = input.texels, h = input.texelMeters, depth = input.depth;
    requireRaster(depth, n, h);
    const N = n * n;
    const periodSeconds = positive(input.periodSeconds, 'the period'), heightMeters = finite(input.heightMeters, 'the wave height');
    if (heightMeters < 0) throw new Error(`[LandscapeOceanShore] the wave height must not be negative; received ${heightMeters}`);
    const headingDegrees = finite(input.headingDegrees, 'the heading');
    const gamma = positive(input.gamma ?? LANDSCAPE_OCEAN_SHORE.defaultGamma, 'gamma');
    const requestedDeep = positive(input.deepDepthMeters ?? LANDSCAPE_OCEAN_SHORE.deepDepthWavelengths * G * periodSeconds * periodSeconds / TWO_PI, 'the source depth');
    const crestMask = requireOptionalArray(input.crestMask, Uint8Array, N, 'crestMask');
    const rock = requireOptionalArray(input.rock, Uint8Array, N, 'rock'), givenShore = requireOptionalArray(input.shoreDistance, Float32Array, N, 'shoreDistance');
    const minDepth = LANDSCAPE_OCEAN_SHORE.minDepthMeters;

    const state = new Uint8Array(N), speed = new Float32Array(N), groupVelocity = new Float32Array(N);
    const travel = new Float64Array(N).fill(Infinity), flux = new Float64Array(N), breaking = new Uint8Array(N);

    // speeds: the inversion of the period at every water depth (runs of equal depth reuse the last one)
    let water = 0, cachedDepth = NaN, cachedSpeed = 0, cachedGroup = 0;
    for (let i = 0; i < N; i++) {
        const d = depth[i];
        if (!(d > 0)) { state[i] = LAND; continue; }
        water++;
        const clamped = Math.max(d, minDepth);
        if (clamped !== cachedDepth) {
            const wave = landscapeOceanPhaseSpeed(periodSeconds, clamped);
            cachedDepth = clamped; cachedSpeed = wave.c; cachedGroup = wave.cg;
        }
        speed[i] = cachedSpeed; groupVelocity[i] = cachedGroup;
    }

    // sources: every water texel at the source depth, else the deepest fraction of the water
    let deep = requestedDeep, sourceCount = 0;
    for (let i = 0; i < N; i++) if (state[i] !== LAND && depth[i] >= deep) sourceCount++;
    if (!sourceCount && water) {
        const depths = new Float64Array(water);
        let w = 0;
        for (let i = 0; i < N; i++) if (state[i] !== LAND) depths[w++] = depth[i];
        depths.sort();
        deep = depths[water - Math.max(1, Math.ceil(LANDSCAPE_OCEAN_SHORE.fallbackSourceFraction * water))];
        for (let i = 0; i < N; i++) if (state[i] !== LAND && depth[i] >= deep) sourceCount++;
    }
    const deepWave = water ? landscapeOceanPhaseSpeed(periodSeconds, Math.max(deep, minDepth)) : { k: 0, c: 1, cg: 1 };
    const sourceFlux = heightMeters * heightMeters * deepWave.cg;

    const heapTexel = new Int32Array(N), heapKey = new Float64Array(N), position = new Int32Array(N).fill(-1);
    let size = 0, accepted = 0;
    const before = (keyA, texelA, keyB, texelB) => keyA < keyB || (keyA === keyB && texelA < texelB);
    const siftUp = slot => {
        const texel = heapTexel[slot], key = heapKey[slot];
        while (slot > 0) {
            const parent = (slot - 1) >> 1;
            if (!before(key, texel, heapKey[parent], heapTexel[parent])) break;
            heapTexel[slot] = heapTexel[parent]; heapKey[slot] = heapKey[parent]; position[heapTexel[slot]] = slot;
            slot = parent;
        }
        heapTexel[slot] = texel; heapKey[slot] = key; position[texel] = slot;
    };
    const siftDown = slot => {
        const texel = heapTexel[slot], key = heapKey[slot];
        for (;;) {
            let child = 2 * slot + 1;
            if (child >= size) break;
            if (child + 1 < size && before(heapKey[child + 1], heapTexel[child + 1], heapKey[child], heapTexel[child])) child++;
            if (!before(heapKey[child], heapTexel[child], key, texel)) break;
            heapTexel[slot] = heapTexel[child]; heapKey[slot] = heapKey[child]; position[heapTexel[slot]] = slot;
            slot = child;
        }
        heapTexel[slot] = texel; heapKey[slot] = key; position[texel] = slot;
    };
    const push = (texel, key) => {
        const slot = size++;
        heapTexel[slot] = texel; heapKey[slot] = key; position[texel] = slot;
        siftUp(slot);
    };
    const decrease = (texel, key) => {
        const slot = position[texel];
        heapKey[slot] = key;
        siftUp(slot);
    };
    const pop = () => {
        const texel = heapTexel[0], key = heapKey[0];
        position[texel] = -1; size--;
        if (size > 0) {
            heapTexel[0] = heapTexel[size]; heapKey[0] = heapKey[size]; position[heapTexel[0]] = 0;
            siftDown(0);
        }
        travel[texel] = key;
        return texel;
    };

    // the upwind quadratic of the eikonal equation at a texel from its accepted neighbours: with the smaller neighbour a per axis and f = h / c,
    // ((T - a) / h)^2 + ((T - b) / h)^2 = 1 / c^2 when both axes are upwind (|a - b| < f), else the one-sided T = min(a, b) + f
    const solve = j => {
        const c = j % n, r = (j - c) / n;
        const a = Math.min(c > 0 ? travel[j - 1] : Infinity, c < n - 1 ? travel[j + 1] : Infinity);
        const b = Math.min(r > 0 ? travel[j - n] : Infinity, r < n - 1 ? travel[j + n] : Infinity);
        const f = h / speed[j];
        if (a === Infinity) return b + f;
        if (b === Infinity) return a + f;
        const difference = a - b;
        if (Math.abs(difference) >= f) return Math.min(a, b) + f;
        return 0.5 * (a + b + Math.sqrt(2 * f * f - difference * difference));
    };
    const relax = j => {
        const s = state[j];
        if (s === LAND || s === ACCEPTED) return;
        const t = solve(j);
        if (s === FAR) { state[j] = NARROW; push(j, t); }
        else if (t < heapKey[position[j]]) decrease(j, t);
    };
    const relaxNeighbours = i => {
        const c = i % n;
        if (c > 0) relax(i - 1);
        if (c < n - 1) relax(i + 1);
        if (i >= n) relax(i - n);
        if (i + n < N) relax(i + n);
    };
    // the cap binds (and the texel breaks) when the inherited flux reaches it: a bore stays a bore over a flat reef and reforms only where the floor drops
    const settle = (i, inherited) => {
        const cap = rock && rock[i] ? Infinity : (gamma * depth[i]) ** 2 * groupVelocity[i];
        if (inherited >= cap) { flux[i] = cap; breaking[i] = 1; } else flux[i] = inherited;
    };
    // the flux arrives along the characteristic: each accepted upwind neighbour contributes in proportion to its time lag (the gradient component
    // through it); a texel without an earlier neighbour (a tie) takes the smallest flux of its accepted neighbours
    const upwindFlux = (i, j, t, result) => {
        if (state[j] !== ACCEPTED) return;
        const lag = t - travel[j];
        if (lag > 0) { result[0] += lag * flux[j]; result[1] += lag; } else if (flux[j] < result[2]) result[2] = flux[j];
    };
    const inherited = new Float64Array(3);
    const accept = i => {
        state[i] = ACCEPTED;
        const t = travel[i], c = i % n;
        inherited[0] = 0; inherited[1] = 0; inherited[2] = Infinity;
        if (c > 0) upwindFlux(i, i - 1, t, inherited);
        if (c < n - 1) upwindFlux(i, i + 1, t, inherited);
        if (i >= n) upwindFlux(i, i - n, t, inherited);
        if (i + n < N) upwindFlux(i, i + n, t, inherited);
        settle(i, inherited[1] > 0 ? inherited[0] / inherited[1] : inherited[2]);
        relaxNeighbours(i);
    };

    // plane-wave sources: T = (x dx + z dz) / c_deep over the texel centres, the earliest at 0
    const radians = headingDegrees * Math.PI / 180, dx = Math.sin(radians), dz = Math.cos(radians);
    const sources = new Int32Array(sourceCount);
    let s = 0, minTime = Infinity;
    for (let i = 0; i < N; i++) {
        if (state[i] === LAND || depth[i] < deep) continue;
        const c = i % n, r = (i - c) / n, t = ((c + 0.5) * dx + (r + 0.5) * dz) * h / deepWave.c;
        travel[i] = t;
        if (t < minTime) minTime = t;
        sources[s++] = i;
    }
    for (let q = 0; q < sourceCount; q++) {
        const i = sources[q];
        travel[i] -= minTime; state[i] = ACCEPTED;
        settle(i, sourceFlux);
    }
    for (let q = 0; q < sourceCount; q++) relaxNeighbours(sources[q]);

    const gradient = new Float64Array(2);
    const differences = (values, i, usable) => {
        const c = i % n, r = (i - c) / n;
        const left = c > 0 && usable(i - 1), right = c < n - 1 && usable(i + 1);
        gradient[0] = left && right ? (values[i + 1] - values[i - 1]) / (2 * h) : right ? (values[i + 1] - values[i]) / h : left ? (values[i] - values[i - 1]) / h : 0;
        const down = r > 0 && usable(i - n), up = r < n - 1 && usable(i + n);
        gradient[1] = down && up ? (values[i + n] - values[i - n]) / (2 * h) : up ? (values[i + n] - values[i]) / h : down ? (values[i] - values[i - n]) / h : 0;
    };
    const isAccepted = j => state[j] === ACCEPTED;
    const always = () => true;

    const finish = () => {
        const travelTime = new Float32Array(N), waveHeight = new Float32Array(N);
        let breakingTexels = 0;
        for (let i = 0; i < N; i++) {
            if (state[i] !== ACCEPTED) { travelTime[i] = LANDSCAPE_OCEAN_SHORE.travelTimeSentinel; continue; }
            travelTime[i] = travel[i]; waveHeight[i] = Math.sqrt(flux[i] / groupVelocity[i]);
            if (breaking[i]) breakingTexels++;
        }
        const shore = breakingTexels ? (givenShore ?? landscapeOceanShoreDistance(depth, n, h)) : givenShore;
        const depths = new Float64Array(breakingTexels), angles = new Float64Array(breakingTexels);
        let k = 0, a = 0, angleSum = 0;
        for (let i = 0; i < N && k < breakingTexels; i++) {
            if (!breaking[i]) continue;
            depths[k++] = depth[i];
            if (crestMask && !crestMask[i]) continue;
            differences(travel, i, isAccepted);
            const tx = gradient[0], tz = gradient[1];
            differences(/** @type {Float32Array} */ (shore), i, always);
            const norm = Math.hypot(tx, tz) * Math.hypot(gradient[0], gradient[1]);
            if (!(norm > 0)) continue;
            const angle = Math.acos(Math.min(1, Math.abs(tx * gradient[0] + tz * gradient[1]) / norm)) * 180 / Math.PI;
            angles[a++] = angle; angleSum += angle;
        }
        depths.sort();
        const sortedAngles = angles.subarray(0, a).sort();
        /** @type {LandscapeOceanShoreStatistics} */
        const statistics = {
            sources: sourceCount, water, visited: accepted, deepDepthMeters: deep, breakingTexels,
            breakingDepth: { median: quantile(depths, .5), p10: quantile(depths, .1), p90: quantile(depths, .9) },
            crestAngle: { meanDegrees: a ? angleSum / a : NaN, p90Degrees: quantile(sortedAngles, .9), texels: a }
        };
        return { travelTime, waveHeight, breaking, statistics };
    };

    return {
        get accepted() { return accepted; },
        get total() { return water - sourceCount; },
        /** Accepts up to limit texels; true once the heap is empty. @param {number} limit */
        advance(limit) {
            let count = 0;
            while (size > 0 && count < limit) { accept(pop()); count++; }
            accepted += count;
            return size === 0;
        },
        finish
    };
}

/**
 * The travel time (s; the sentinel on land and unreached water), the shoaled wave height (m; 0 there), the breaking mask and the statistics of a
 * plane swell marched over a depth raster from its deep-water sources.
 * @param {LandscapeOceanShoreInput} input
 * @returns {{travelTime:Float32Array,waveHeight:Float32Array,breaking:Uint8Array,statistics:LandscapeOceanShoreStatistics}}
 */
export function landscapeOceanShoreWaves(input) {
    const march = createShoreMarch(input);
    march.advance(Infinity);
    return march.finish();
}

/**
 * The shore distance and the shore waves of a raster computed in slices that yield to the event loop between them (bit-identical to the
 * synchronous functions); onYield reports the accepted and total march texels after each yield.
 * @param {LandscapeOceanShoreInput} input
 * @param {{yieldEvery?:number,onYield?:((progress:{accepted:number,total:number}) => void)|null}} [options]
 * @returns {Promise<{shoreDistance:Float32Array,travelTime:Float32Array,waveHeight:Float32Array,breaking:Uint8Array,statistics:LandscapeOceanShoreStatistics,milliseconds:number}>}
 */
export async function computeLandscapeOceanShore(input, { yieldEvery = LANDSCAPE_OCEAN_SHORE.yieldEvery, onYield = null } = {}) {
    const started = performance.now();
    if (!Number.isInteger(yieldEvery) || yieldEvery < 1) throw new Error(`[LandscapeOceanShore] yieldEvery must be a positive integer; received ${String(yieldEvery)}`);
    const shoreDistance = input.shoreDistance ?? landscapeOceanShoreDistance(input.depth, input.texels, input.texelMeters);
    const march = createShoreMarch({ ...input, shoreDistance });
    while (!march.advance(yieldEvery)) {
        await new Promise(resolve => setTimeout(resolve, 0));
        onYield?.({ accepted: march.accepted, total: march.total });
    }
    return { shoreDistance, ...march.finish(), milliseconds: performance.now() - started };
}
