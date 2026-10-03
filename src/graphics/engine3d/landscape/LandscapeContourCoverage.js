// Fits source-classification-preserving visual contours without changing categorical terrain data.
// @ts-check
export const LANDSCAPE_CONTOUR_COVERAGE = Object.freeze({
    id: 'landscape-contour-coverage-v1',
    fit: 'two-soil-boundary-midpoint-pca-with-complete-center-separation',
    units: 'world-xz-meters',
    fitRadiusSamples: 4,
    storedHaloSamples: 2,
    sourceHaloSamples: 6,
    nearBoundaryRadiusSamples: 1,
    minimumBoundaryPoints: 6,
    maximumCovarianceRatio: .12,
    maximumResidualSamples: .75,
    distanceRangeSamples: 4,
    distanceBits: 12,
    invalidPair: 15,
    uniformSupportCode: 0xf001,
    uniformSupportMinOffset: -2,
    uniformSupportMaxOffset: 3,
    pairOrdering: 'lexicographic-unordered-six-soils',
    bytesPerSample: 4,
    scratchBytes: 0,
    measuredDetail: false
});

const PAIRS = Object.freeze(Array.from({ length: 6 }, (_, first) =>
    Array.from({ length: 5 - first }, (_, offset) => Object.freeze([first, first + offset + 1]))).flat());
const DISTANCE_MAX = 4095;
const INVALID = 15 << 12;
const UNIFORM = LANDSCAPE_CONTOUR_COVERAGE.uniformSupportCode;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function pairIndex(first, second) { return first * (11 - first) / 2 + second - first - 1; }

function uniformSupport(source, sourceWidth, centerColumn, centerRow) {
    const soil = source[(centerRow * sourceWidth + centerColumn) * 2] >> 4;
    for (let row = -2; row <= 3; row++) for (let column = -2; column <= 3; column++) {
        if ((source[((centerRow + row) * sourceWidth + centerColumn + column) * 2] >> 4) !== soil) return false;
    }
    return true;
}

function fitContour(source, sourceWidth, centerColumn, centerRow, spacingX, spacingZ) {
    const radius = LANDSCAPE_CONTOUR_COVERAGE.fitRadiusSamples;
    const sample = (column, row) => source[((centerRow + row) * sourceWidth + centerColumn + column) * 2] >> 4;
    const centerSoil = sample(0, 0);
    let nearBoundary = false;
    for (let row = -1; row <= 1 && !nearBoundary; row++) for (let column = -1; column <= 1; column++) {
        if (sample(column, row) !== centerSoil) { nearBoundary = true; break; }
    }
    if (!nearBoundary) return INVALID;
    let first = centerSoil, second = -1, firstCount = 0, secondCount = 0, firstX = 0, firstZ = 0, secondX = 0, secondZ = 0;
    for (let row = -radius; row <= radius; row++) for (let column = -radius; column <= radius; column++) {
        const soil = sample(column, row);
        if (soil === first) { firstCount++; firstX += column * spacingX; firstZ += row * spacingZ; }
        else {
            if (second < 0) second = soil;
            if (soil !== second) return INVALID;
            secondCount++; secondX += column * spacingX; secondZ += row * spacingZ;
        }
    }
    if (second < 0) return INVALID;
    let count = 0, sumX = 0, sumZ = 0, sumXX = 0, sumZZ = 0, sumXZ = 0;
    for (let row = -radius; row <= radius; row++) for (let column = -radius; column <= radius; column++) {
        const soil = sample(column, row);
        for (let axis = 0; axis < 2; axis++) {
            if (axis === 0 ? column === radius : row === radius) continue;
            if (sample(column + (axis === 0 ? 1 : 0), row + (axis === 1 ? 1 : 0)) === soil) continue;
            const x = (column + (axis === 0 ? .5 : 0)) * spacingX, z = (row + (axis === 1 ? .5 : 0)) * spacingZ;
            count++; sumX += x; sumZ += z; sumXX += x * x; sumZZ += z * z; sumXZ += x * z;
        }
    }
    if (count < LANDSCAPE_CONTOUR_COVERAGE.minimumBoundaryPoints) return INVALID;
    const meanX = sumX / count, meanZ = sumZ / count;
    const xx = sumXX / count - meanX * meanX, zz = sumZZ / count - meanZ * meanZ, xz = sumXZ / count - meanX * meanZ;
    const spread = Math.hypot(xx - zz, 2 * xz), major = (xx + zz + spread) / 2, minor = Math.max(0, (xx + zz - spread) / 2);
    if (major <= 0 || minor > major * LANDSCAPE_CONTOUR_COVERAGE.maximumCovarianceRatio) return INVALID;
    const angle = .5 * Math.atan2(2 * xz, xx - zz);
    let nx = -Math.sin(angle), nz = Math.cos(angle);
    if (nx * (secondX / secondCount - firstX / firstCount) + nz * (secondZ / secondCount - firstZ / firstCount) < 0) { nx = -nx; nz = -nz; }
    if (first > second) { const swap = first; first = second; second = swap; nx = -nx; nz = -nz; }
    let firstMaximum = -Infinity, secondMinimum = Infinity;
    for (let row = -radius; row <= radius; row++) for (let column = -radius; column <= radius; column++) {
        const projection = nx * column * spacingX + nz * row * spacingZ;
        if (sample(column, row) === first) firstMaximum = Math.max(firstMaximum, projection);
        else secondMinimum = Math.min(secondMinimum, projection);
    }
    const scale = Math.max(spacingX, spacingZ), range = scale * LANDSCAPE_CONTOUR_COVERAGE.distanceRangeSamples;
    const quantum = 2 * range / DISTANCE_MAX;
    if (secondMinimum - firstMaximum <= quantum * 1.001) return INVALID;
    const offset = (firstMaximum + secondMinimum) / 2, margin = quantum / 2;
    for (let row = -radius; row <= radius; row++) for (let column = -radius; column <= radius; column++) {
        const soil = sample(column, row), distance = nx * column * spacingX + nz * row * spacingZ - offset;
        if (soil === first ? distance >= -margin : distance <= margin) return INVALID;
        for (let axis = 0; axis < 2; axis++) {
            if (axis === 0 ? column === radius : row === radius) continue;
            if (sample(column + (axis === 0 ? 1 : 0), row + (axis === 1 ? 1 : 0)) === soil) continue;
            const residual = distance + (axis === 0 ? nx * spacingX : nz * spacingZ) / 2;
            if (Math.abs(residual) > scale * LANDSCAPE_CONTOUR_COVERAGE.maximumResidualSamples) return INVALID;
        }
    }
    const distanceCode = Math.round((clamp(-offset / range, -1, 1) + 1) * DISTANCE_MAX / 2);
    if (centerSoil === first ? distanceCode >= 2048 : distanceCode < 2048) return INVALID;
    return pairIndex(first, second) << 12 | distanceCode;
}

/** @param {{sourcePixels:Uint8Array,sourceWidth:number,sourceHeight:number,sourceHalo:number,columns:number,rows:number,spacingX:number,spacingZ:number,soilCount?:number}} options */
export function buildLandscapeContourCoverage({ sourcePixels, sourceWidth, sourceHeight, sourceHalo, columns, rows, spacingX, spacingZ, soilCount = 6 }) {
    if (!(sourcePixels instanceof Uint8Array) || ![sourceWidth, sourceHeight, sourceHalo, columns, rows].every(Number.isSafeInteger)
        || columns < 2 || rows < 2 || sourceHalo < LANDSCAPE_CONTOUR_COVERAGE.sourceHaloSamples
        || sourceWidth !== columns + sourceHalo * 2 || sourceHeight !== rows + sourceHalo * 2 || sourcePixels.length !== sourceWidth * sourceHeight * 2
        || !Number.isFinite(spacingX) || !Number.isFinite(spacingZ) || spacingX <= 0 || spacingZ <= 0
        || !Number.isInteger(soilCount) || soilCount < 1 || soilCount > 6) throw new Error('Contour coverage requires a complete RG source neighborhood, one to six soils and positive world spacing');
    for (let i = 0; i < sourcePixels.length; i += 2) if ((sourcePixels[i] >> 4) >= soilCount || (sourcePixels[i] & 15) >= soilCount) throw new Error('Contour source contains an unknown soil identity');
    const halo = LANDSCAPE_CONTOUR_COVERAGE.storedHaloSamples, width = columns + halo * 2, height = rows + halo * 2;
    const pixels = new Uint8Array(width * height * LANDSCAPE_CONTOUR_COVERAGE.bytesPerSample);
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const sourceColumn = column + sourceHalo - halo, sourceRow = row + sourceHalo - halo;
        const from = (sourceRow * sourceWidth + sourceColumn) * 2, to = (row * width + column) * 4;
        const code = uniformSupport(sourcePixels, sourceWidth, sourceColumn, sourceRow) ? UNIFORM : fitContour(sourcePixels, sourceWidth, sourceColumn, sourceRow, spacingX, spacingZ);
        pixels[to] = sourcePixels[from]; pixels[to + 1] = sourcePixels[from + 1]; pixels[to + 2] = code & 255; pixels[to + 3] = code >> 8;
    }
    return pixels;
}

/** @param {number} lowByte @param {number} highByte @param {number} spacingX @param {number} spacingZ */
export function decodeLandscapeContourSample(lowByte, highByte, spacingX, spacingZ) {
    if (![lowByte, highByte].every(value => Number.isInteger(value) && value >= 0 && value <= 255)
        || ![spacingX, spacingZ].every(value => Number.isFinite(value) && value > 0)) throw new Error('Contour decoding needs byte values and positive world spacing');
    const code = lowByte | highByte << 8, index = code >> 12;
    if (index === LANDSCAPE_CONTOUR_COVERAGE.invalidPair) return { valid: false, uniformSupport: code === UNIFORM, pairIndex: index, soils: null, distanceMeters: 0 };
    return { valid: true, uniformSupport: false, pairIndex: index, soils: PAIRS[index], distanceMeters: ((code & DISTANCE_MAX) / DISTANCE_MAX * 2 - 1) * LANDSCAPE_CONTOUR_COVERAGE.distanceRangeSamples * Math.max(spacingX, spacingZ) };
}

/** @param {{pixels:Uint8Array,width:number,height:number,columns:number,rows:number,spacingX:number,spacingZ:number,xGrid:number,zGrid:number,byteOffset?:number}} options */
export function sampleLandscapeContourField({ pixels, width, height, columns, rows, spacingX, spacingZ, xGrid, zGrid, byteOffset = 0 }) {
    const halo = LANDSCAPE_CONTOUR_COVERAGE.storedHaloSamples;
    if (!(pixels instanceof Uint8Array) || ![width, height, columns, rows, byteOffset].every(Number.isSafeInteger) || columns < 2 || rows < 2
        || width !== columns + halo * 2 || height !== rows + halo * 2 || byteOffset < 0 || byteOffset + width * height * 4 > pixels.length
        || ![spacingX, spacingZ].every(value => Number.isFinite(value) && value > 0) || ![xGrid, zGrid].every(Number.isFinite)) throw new Error('Contour field sampling needs a complete RGBA page and finite grid coordinates');
    const gx = clamp(xGrid, 0, columns - 1), gz = clamp(zGrid, 0, rows - 1);
    const column = Math.min(Math.floor(gx), columns - 2), row = Math.min(Math.floor(gz), rows - 2), tx = gx - column, tz = gz - row;
    const groups = new Map();
    for (let cornerZ = 0; cornerZ < 2; cornerZ++) for (let cornerX = 0; cornerX < 2; cornerX++) {
        const index = byteOffset + ((row + cornerZ + halo) * width + column + cornerX + halo) * 4;
        const decoded = decodeLandscapeContourSample(pixels[index + 2], pixels[index + 3], spacingX, spacingZ);
        if (!decoded.valid) continue;
        const wx = cornerX ? tx : 1 - tx, wz = cornerZ ? tz : 1 - tz, weight = wx * wz;
        const derivativeX = (cornerX ? 1 : -1) * wz / spacingX, derivativeZ = -(cornerZ ? 1 : -1) * wx / spacingZ;
        if (!groups.has(decoded.pairIndex)) groups.set(decoded.pairIndex, { pairIndex: decoded.pairIndex, soils: decoded.soils, confidence: 0, numerator: 0, dx: 0, dz: 0, numeratorX: 0, numeratorZ: 0 });
        const group = groups.get(decoded.pairIndex);
        group.confidence += weight; group.numerator += weight * decoded.distanceMeters; group.dx += derivativeX; group.dz += derivativeZ;
        group.numeratorX += derivativeX * decoded.distanceMeters; group.numeratorZ += derivativeZ * decoded.distanceMeters;
    }
    const pairs = [...groups.values()].filter(group => group.confidence > 0).map(group => ({ pairIndex: group.pairIndex, soils: group.soils, confidence: group.confidence,
        distanceMeters: group.numerator / group.confidence, gradientX: (group.numeratorX * group.confidence - group.numerator * group.dx) / group.confidence ** 2,
        gradientZ: (group.numeratorZ * group.confidence - group.numerator * group.dz) / group.confidence ** 2 }));
    return { confidence: pairs.reduce((sum, pair) => sum + pair.confidence, 0), pairs };
}
