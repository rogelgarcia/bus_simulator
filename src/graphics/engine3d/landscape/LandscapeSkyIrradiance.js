// Projects the calibrated sky environment onto compact irradiance harmonics for the landscape shaders (pure, renderer independent).
// @ts-check
// Design: second-order spherical harmonics alone overstate the clear sky's zenith irradiance by about 9% (red) because its bright horizon
// band sits on a nearly black lower hemisphere, so the basis adds the zonal bands 4 and 6 about the zenith. Odd bands above 1 never reach
// irradiance (the clamped-cosine kernel has none), so eleven coefficients per channel bring the upper-hemisphere error to about 2%. Each
// coefficient is a projection convolved with the clamped cosine and folded with its basis normalization, so a shader evaluates plain
// polynomials of the unit normal (y up, landscape space).

const PI = Math.PI;
const NORMALIZATION = Object.freeze([0.28209479177387814, 0.4886025119029199, 0.4886025119029199, 0.4886025119029199, 1.0925484305920792,
    1.0925484305920792, 0.31539156525252005, 1.0925484305920792, 0.5462742152960396, 0.10578554691520431, 0.06356920226762842]);
const COSINE_LOBE = Object.freeze([PI, 2 * PI / 3, 2 * PI / 3, 2 * PI / 3, PI / 4, PI / 4, PI / 4, PI / 4, PI / 4, -PI / 24, PI / 64]);
const COEFFICIENTS = NORMALIZATION.length;

export const LANDSCAPE_SKY_IRRADIANCE = Object.freeze({
    model: 'landscape-sky-irradiance-sh2-zonal46-v1',
    basis: Object.freeze(['1', 'x', 'y', 'z', 'xz', 'zy', '3y^2-1', 'xy', 'x^2-z^2', '35y^4-30y^2+3', '231y^6-315y^4+105y^2-5']),
    bands: Object.freeze([0, 1, 1, 1, 2, 2, 2, 2, 2, 4, 6]),
    coefficients: COEFFICIENTS,
    upAxis: 'y',
    mapping: 'three.js equirectangular: row 0 is +Y and u = atan2(z, x) / 2π + 0.5 in the environment (game) frame',
    uniformLayout: 'per channel R, G, B three vec4: (1, x, y, z), (xz, zy, 3y^2-1, xy), (x^2-z^2, P4, P6, haze calibration)',
    uniformVectors: 9
});

let halfTable = null;

/** @param {number} bits IEEE 754 binary16 bit pattern @returns {number} */
export function decodeLandscapeHalfFloat(bits) {
    if (!Number.isInteger(bits) || bits < 0 || bits > 0xffff) throw new Error(`[Landscape] A half float is a 16-bit pattern; received ${bits}`);
    const exponent = (bits >> 10) & 0x1f, mantissa = bits & 0x3ff, sign = bits & 0x8000 ? -1 : 1;
    if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
    if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
    return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

function halfFloats() {
    if (halfTable) return halfTable;
    halfTable = new Float32Array(65536);
    for (let bits = 0; bits < 65536; bits++) halfTable[bits] = decodeLandscapeHalfFloat(bits);
    return halfTable;
}

/**
 * @typedef {{width:number,height:number,data:Float32Array|Uint16Array,channels:number,encoding:'float'|'half'}} LandscapeEquirectImage
 * Linear radiance, three.js equirectangular mapping, rows from +Y down; `half` data holds binary16 bit patterns (three.js HalfFloatType).
 */

/**
 * Validates an equirectangular environment and returns its texel access: `decode` maps binary16 patterns to numbers (null for float data).
 * @param {LandscapeEquirectImage} image @returns {{width:number,height:number,data:Float32Array|Uint16Array,channels:number,decode:Float32Array|null}}
 */
export function assertLandscapeEquirectImage(image) {
    return assertImage(image);
}

/** @param {LandscapeEquirectImage} image */
function assertImage(image) {
    const { width, height, data, channels, encoding } = image ?? {};
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 4 || height < 2) throw new Error('[Landscape] The sky environment needs integer equirectangular dimensions');
    if (channels !== 3 && channels !== 4) throw new Error(`[Landscape] The sky environment needs RGB or RGBA texels; received ${channels} channels`);
    if (encoding === 'half' ? !(data instanceof Uint16Array) : encoding !== 'float' || !(data instanceof Float32Array)) throw new Error(`[Landscape] Sky environment encoding ${encoding} does not match its ${data?.constructor?.name} data`);
    if (data.length !== width * height * channels) throw new Error(`[Landscape] Sky environment holds ${data.length} values; ${width}×${height}×${channels} expected`);
    return { width, height, data, channels, decode: encoding === 'half' ? halfFloats() : null };
}

/** @param {number} y @returns {number[]} the zonal polynomials of bands 4 and 6 */
function zonal(y) {
    const y2 = y * y;
    return [(35 * y2 - 30) * y2 + 3, ((231 * y2 - 315) * y2 + 105) * y2 - 5];
}

// Every basis polynomial separates into a factor of y = sin(elevation) and a factor of the azimuth; with dΩ = dy·dφ, both integrate in closed
// form over a texel, so the projection is exact for piecewise-constant texels. Antiderivatives over y of
// 1, sqrt(1-y²), y, 1-y², y·sqrt(1-y²), 3y²-1, P4 and P6 (each basis term names its y factor below).
const LATITUDE_ANTIDERIVATIVES = Object.freeze([
    y => y,
    y => .5 * (y * Math.sqrt(Math.max(0, 1 - y * y)) + Math.asin(Math.max(-1, Math.min(1, y)))),
    y => .5 * y * y,
    y => y - y * y * y / 3,
    y => -(Math.max(0, 1 - y * y) ** 1.5) / 3,
    y => y * y * y - y,
    y => ((7 * y * y - 10) * y * y + 3) * y,
    y => (((33 * y * y - 63) * y * y + 35) * y * y - 5) * y
]);
// basis term → [latitude factor, azimuth factor (0: 1, 1: cos, 2: sin, 3: cos·sin, 4: cos²-sin²)]
const SEPARATION = Object.freeze([[0, 0], [1, 1], [2, 0], [1, 2], [3, 3], [4, 2], [5, 0], [4, 1], [3, 4], [6, 0], [7, 0]]);

/** @param {ArrayLike<number>} n unit direction @returns {number[]} the eleven basis polynomials */
export function landscapeSkyBasis(n) {
    const [x, y, z] = n, [p4, p6] = zonal(y);
    return [1, x, y, z, x * z, z * y, 3 * y * y - 1, x * y, x * x - z * z, p4, p6];
}

/**
 * Projects an equirectangular radiance environment onto the irradiance basis in landscape space. The environment stays fixed in the
 * game frame; a city binding yaw (landscape → city rotation about +Y, as in landscapePointToCity) turns every environment direction
 * back into landscape space before projection.
 * @param {LandscapeEquirectImage} input
 * @param {{yawDegrees?:number}} [frame]
 * @returns {Readonly<{model:string,coefficients:Float64Array,solidAngle:number,width:number,height:number,yawDegrees:number}>} coefficients k-major ([k*3+channel]) in irradiance units
 */
export function projectLandscapeSkyIrradiance(input, { yawDegrees = 0 } = {}) {
    const { width, height, data, channels, decode } = assertImage(input);
    if (!Number.isFinite(yawDegrees)) throw new Error('[Landscape] The sky projection yaw must be finite');
    const yaw = yawDegrees * PI / 180, columns = new Float64Array(width * 5);
    for (let column = 0; column < width; column++) {
        const a = (column / width - .5) * 2 * PI + yaw, b = ((column + 1) / width - .5) * 2 * PI + yaw;
        columns.set([b - a, Math.sin(b) - Math.sin(a), Math.cos(a) - Math.cos(b), .5 * (Math.sin(b) ** 2 - Math.sin(a) ** 2), .5 * (Math.sin(2 * b) - Math.sin(2 * a))], column * 5);
    }
    const sums = new Float64Array(COEFFICIENTS * 3), row = new Float64Array(15);
    let solidAngle = 0;
    for (let y = 0; y < height; y++) {
        const top = Math.sin(PI / 2 - y / height * PI), bottom = Math.sin(PI / 2 - (y + 1) / height * PI);
        const latitude = LATITUDE_ANTIDERIVATIVES.map(antiderivative => antiderivative(top) - antiderivative(bottom));
        row.fill(0);
        for (let column = 0, offset = y * width * channels; column < width; column++, offset += channels) {
            const k = column * 5;
            for (let channel = 0; channel < 3; channel++) {
                const value = decode ? decode[data[offset + channel]] : data[offset + channel], base = channel * 5;
                for (let factor = 0; factor < 5; factor++) row[base + factor] += value * columns[k + factor];
            }
        }
        for (let channel = 0; channel < 3; channel++) SEPARATION.forEach(([lat, azimuth], index) => { sums[index * 3 + channel] += latitude[lat] * row[channel * 5 + azimuth]; });
        solidAngle += latitude[0] * 2 * PI;
    }
    const coefficients = new Float64Array(COEFFICIENTS * 3);
    for (let index = 0; index < COEFFICIENTS; index++) for (let channel = 0; channel < 3; channel++) {
        coefficients[index * 3 + channel] = COSINE_LOBE[index] * NORMALIZATION[index] ** 2 * sums[index * 3 + channel];
    }
    return Object.freeze({ model: LANDSCAPE_SKY_IRRADIANCE.model, coefficients, solidAngle, width, height, yawDegrees });
}

/** @param {ArrayLike<number>} coefficients k-major irradiance coefficients @returns {Float64Array} */
function assertCoefficients(coefficients) {
    if (!coefficients || coefficients.length !== COEFFICIENTS * 3 || !Array.from(coefficients).every(Number.isFinite)) throw new Error(`[Landscape] Sky irradiance needs ${COEFFICIENTS * 3} finite coefficients`);
    return Float64Array.from(coefficients);
}

/**
 * Per channel band sums at a unit direction: [band 0, band 1, band 2, zonal bands 4 and 6], each in irradiance units.
 * @param {ArrayLike<number>} coefficients @param {ArrayLike<number>} n @returns {number[][]}
 */
export function landscapeSkyBands(coefficients, n) {
    const values = assertCoefficients(coefficients), basis = landscapeSkyBasis(n);
    return [0, 1, 2].map(channel => {
        const term = index => values[index * 3 + channel] * basis[index];
        return [term(0), term(1) + term(2) + term(3), term(4) + term(5) + term(6) + term(7) + term(8), term(9) + term(10)];
    });
}

/** Irradiance on a surface with unit normal n (unclamped, as the harmonic series evaluates it). @param {ArrayLike<number>} coefficients @param {ArrayLike<number>} n @returns {number[]} */
export function evaluateLandscapeSkyIrradiance(coefficients, n) {
    return landscapeSkyBands(coefficients, n).map(bands => bands[0] + bands[1] + bands[2] + bands[3]);
}

/**
 * Sky radiance convolved with a phase function along a direction: Σ weights[l] · (radiance band l), l = 0..2, where the weights are the
 * phase function's normalized zonal coefficients (Henyey-Greenstein: 1, g, g²; Rayleigh: 1, 0, 0.1).
 * @param {ArrayLike<number>} coefficients @param {ArrayLike<number>} direction @param {ArrayLike<number>} weights @returns {number[]}
 */
export function landscapeSkyRadianceBands(coefficients, direction, weights) {
    const scale = [weights[0] / COSINE_LOBE[0], weights[1] / COSINE_LOBE[1], weights[2] / COSINE_LOBE[4]];
    return landscapeSkyBands(coefficients, direction).map(bands => bands[0] * scale[0] + bands[1] * scale[1] + bands[2] * scale[2]);
}

/**
 * Mean radiance of the environment just above the horizon (0 < elevation ≤ maxElevationDeg, solid-angle weighted): the radiance an infinitely
 * long horizontal path through the calibrated atmosphere converges to.
 * @param {LandscapeEquirectImage} input @param {{maxElevationDeg?:number}} [options] @returns {number[]}
 */
export function landscapeSkyHorizonRadiance(input, { maxElevationDeg = 1 } = {}) {
    const { width, height, data, channels, decode } = assertImage(input);
    if (!(maxElevationDeg > 0 && maxElevationDeg < 90)) throw new Error('[Landscape] The horizon band must lie between 0 and 90 degrees');
    const sums = [0, 0, 0];
    let total = 0;
    for (let y = 0; y < height; y++) {
        const elevation = 90 - (y + .5) / height * 180;
        if (elevation <= 0 || elevation > maxElevationDeg) continue;
        const weight = Math.cos(elevation * PI / 180);
        for (let column = 0, offset = y * width * channels; column < width; column++, offset += channels) {
            for (let channel = 0; channel < 3; channel++) sums[channel] += (decode ? decode[data[offset + channel]] : data[offset + channel]) * weight;
        }
        total += weight * width;
    }
    if (!total) throw new Error(`[Landscape] The ${height}-row environment has no row center within ${maxElevationDeg}° above the horizon`);
    return sums.map(value => value / total);
}

/**
 * Packs irradiance coefficients and the per-channel haze calibration into the nine-vec4 uLandscapeSky layout.
 * @param {ArrayLike<number>} coefficients @param {ArrayLike<number>} calibration @param {Float32Array} [target] @returns {Float32Array}
 */
export function packLandscapeSkyUniform(coefficients, calibration, target = new Float32Array(36)) {
    const values = assertCoefficients(coefficients);
    if (!calibration || calibration.length !== 3 || !Array.from(calibration).every(value => Number.isFinite(value) && value >= 0)) throw new Error('[Landscape] The haze calibration needs three non-negative channels');
    if (!(target instanceof Float32Array) || target.length !== 36) throw new Error('[Landscape] The sky uniform is 36 floats');
    for (let channel = 0; channel < 3; channel++) {
        for (let index = 0; index < COEFFICIENTS; index++) target[channel * 12 + index] = values[index * 3 + channel];
        target[channel * 12 + 11] = calibration[channel];
    }
    return target;
}
