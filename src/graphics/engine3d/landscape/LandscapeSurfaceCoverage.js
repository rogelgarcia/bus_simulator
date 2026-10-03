// Reconstructs continuous display-material coverage while retaining categorical source identities.
// @ts-check
import { LANDSCAPE_CONTOUR_COVERAGE, sampleLandscapeContourField } from './LandscapeContourCoverage.js';
export const LANDSCAPE_SURFACE_COVERAGE = Object.freeze({
    id: 'landscape-surface-coverage-v1',
    source: 'land-cover-and-ordered-soil-overrides',
    nearKernel: 'clamped-normalized-catmull-rom',
    farKernel: 'pixel-box-integrated-cubic-bspline',
    transition: 'normalized-maximum-competitor-margin',
    filter: 'local-planar-margin-box-integral',
    blendWidthMeters: .75,
    haloSamples: 2,
    minificationStartCells: .5,
    minificationEndCells: 1,
    ancestorFilterStartCells: 1,
    ancestorFilterEndCells: 2,
    maximumFilterWidthCells: 2,
    projectionDegenerateWidth: .02,
    positiveClampWidth: .01,
    continuousEvaluation: true,
    storedSubmeterData: false,
    nativeAreaAverage: false
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

/** @param {any} descriptor */
export function landscapeCoverageMaskLayout(descriptor) {
    const { columns, rows } = descriptor;
    if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns < 2 || rows < 2) throw new Error('Coverage masks require at least one source interval per axis');
    const halo = LANDSCAPE_SURFACE_COVERAGE.haloSamples, sourceHalo = halo + LANDSCAPE_CONTOUR_COVERAGE.fitRadiusSamples;
    const width = columns + halo * 2, height = rows + halo * 2, sourceWidth = columns + sourceHalo * 2, sourceHeight = rows + sourceHalo * 2;
    return Object.freeze({ columns, rows, halo, sourceHalo, width, height, sourceWidth, sourceHeight, pixelBytes: 4,
        pageBytes: width * height * 4, decodeBytes: width * height * 4 + sourceWidth * sourceHeight * 2 + columns * rows * 8 });
}

/** @param {ReturnType<typeof sampleLandscapeSurfaceCoverage>} base @param {any} input */
export function applyLandscapeContourCoverage(base, input) {
    const field = sampleLandscapeContourField(input), model = LANDSCAPE_SURFACE_COVERAGE, fade = 1 - base.minification;
    const weights = base.weights.map((weight, i) => weight - base.nearWeights[i] * field.confidence * fade);
    for (const pair of field.pairs) {
        const dx = input.dx ?? [0, 0], dy = input.dy ?? [0, 0];
        const high = landscapeCoverageRampAverage(.5 + pair.distanceMeters / model.blendWidthMeters,
            Math.abs(pair.gradientX * dx[0] + pair.gradientZ * dx[1]) / model.blendWidthMeters,
            Math.abs(pair.gradientX * dy[0] + pair.gradientZ * dy[1]) / model.blendWidthMeters);
        weights[pair.soils[0]] += pair.confidence * fade * (1 - high);
        weights[pair.soils[1]] += pair.confidence * fade * high;
    }
    return { ...base, weights, contour: field };
}

/** @param {{bounds:any,x:number,z:number,progress:number,neighborProgress:number[],bandMeters:number}} input */
export function landscapeCoverageAvailability({ bounds, x, z, progress, neighborProgress, bandMeters }) {
    const width = bounds.maxX - bounds.minX, height = bounds.maxZ - bounds.minZ, band = Math.min(bandMeters, width, height);
    let result = progress, index = 0;
    for (let row = -1; row <= 1; row++) for (let column = -1; column <= 1; column++) {
        if (column === 0 && row === 0) continue;
        const minX = bounds.minX + column * width, maxX = bounds.maxX + column * width;
        const minZ = bounds.minZ - row * height, maxZ = bounds.maxZ - row * height;
        const distance = Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));
        const fade = smoothstep(distance / band), neighbor = neighborProgress[index++];
        result = Math.min(result, neighbor + (1 - neighbor) * fade);
    }
    return result;
}

function cardinal(value) {
    const x = Math.abs(value), sign = Math.sign(value);
    if (x < 1) return [1 - 2.5 * x * x + 1.5 * x * x * x, sign * (-5 * x + 4.5 * x * x)];
    if (x < 2) return [2 - 4 * x + 2.5 * x * x - .5 * x * x * x, sign * (-4 + 5 * x - 1.5 * x * x)];
    return [0, 0];
}

function spline(value) {
    const x = Math.abs(value);
    return x < 1 ? 2 / 3 - x * x + .5 * x * x * x : x < 2 ? (2 - x) ** 3 / 6 : 0;
}

function splineIntegral(value) {
    const x = Math.abs(value);
    const result = x >= 2 ? .5 : x >= 1 ? .5 - (2 - x) ** 4 / 24 : 2 * x / 3 - x ** 3 / 3 + x ** 4 / 8;
    return .5 + Math.sign(value) * result;
}

function integratedSpline(value, halfWidth) {
    return halfWidth < .01 ? spline(value) : (splineIntegral(value + halfWidth) - splineIntegral(value - halfWidth)) / (2 * halfWidth);
}

function rampIntegral(value) {
    if (value <= 0) return 0;
    return value >= 1 ? value - .5 : value ** 3 - .5 * value ** 4;
}

function rampDoubleIntegral(value) {
    if (value <= 0) return 0;
    return value >= 1 ? .5 * value * value - .5 * value + .15 : value ** 4 / 4 - value ** 5 / 10;
}

/** @param {number} center @param {number} widthX @param {number} widthY @returns {number} */
export function landscapeCoverageRampAverage(center, widthX, widthY) {
    if (![center, widthX, widthY].every(Number.isFinite) || widthX < 0 || widthY < 0) throw new Error('Coverage ramp arguments must be finite with nonnegative widths');
    const a = Math.max(widthX, widthY), b = Math.min(widthX, widthY), half = (a + b) / 2;
    if (center + half <= 0) return 0;
    if (center - half >= 1) return 1;
    const threshold = LANDSCAPE_SURFACE_COVERAGE.projectionDegenerateWidth;
    if (a < threshold) return smoothstep(center);
    if (b < threshold || b < a * .01) return clamp((rampIntegral(center + a / 2) - rampIntegral(center - a / 2)) / a, 0, 1);
    return clamp((rampDoubleIntegral(center + half) - rampDoubleIntegral(center + (a - b) / 2)
        - rampDoubleIntegral(center + (b - a) / 2) + rampDoubleIntegral(center - half)) / (a * b), 0, 1);
}

/** @param {{bounds:any,columns:number,rows:number,x:number,z:number,soilAt:(column:number,row:number)=>number,soilCount?:number,dx?:number[],dy?:number[]}} input */
export function sampleLandscapeSurfaceCoverage({ bounds, columns, rows, x, z, soilAt, soilCount = 6, dx = [0, 0], dy = [0, 0] }) {
    if (![x, z, ...dx, ...dy].every(Number.isFinite) || dx.length !== 2 || dy.length !== 2 || !Number.isInteger(soilCount) || soilCount < 1 || soilCount > 6) throw new Error('Coverage sample needs finite coordinates, footprint vectors and one to six soils');
    const spacingX = (bounds.maxX - bounds.minX) / (columns - 1), spacingZ = (bounds.maxZ - bounds.minZ) / (rows - 1);
    if (!(spacingX > 0 && spacingZ > 0)) throw new Error('Coverage source spacing must be positive');
    const gx = clamp((x - bounds.minX) / spacingX, 0, columns - 1), gz = clamp((bounds.maxZ - z) / spacingZ, 0, rows - 1);
    const cellX = Math.floor(gx), cellZ = Math.floor(gz);
    const extentX = Math.abs(dx[0]) + Math.abs(dy[0]), extentZ = Math.abs(dx[1]) + Math.abs(dy[1]);
    const footprintCells = Math.max(extentX / spacingX, extentZ / spacingZ);
    const model = LANDSCAPE_SURFACE_COVERAGE, minification = smoothstep((footprintCells - model.minificationStartCells) / (model.minificationEndCells - model.minificationStartCells));
    const halfX = Math.min(1, extentX / spacingX / 2), halfZ = Math.min(1, extentZ / spacingZ / 2);
    const weights = Array(soilCount).fill(0), gradientX = Array(soilCount).fill(0), gradientZ = Array(soilCount).fill(0), filtered = Array(soilCount).fill(0);
    for (let row = -2; row <= 3; row++) {
        const [wz, dz] = cardinal(gz - cellZ - row), fz = minification > 0 ? integratedSpline(gz - cellZ - row, halfZ) : 0;
        for (let column = -2; column <= 3; column++) {
            const [wx, dxx] = cardinal(gx - cellX - column), fx = minification > 0 ? integratedSpline(gx - cellX - column, halfX) : 0;
            if (wx * wz === 0 && fx * fz === 0 && dxx * wz === 0 && wx * dz === 0) continue;
            const soil = soilAt(cellX + column, cellZ + row);
            if (!Number.isInteger(soil) || soil < 0 || soil >= soilCount) throw new Error('Coverage support contains an unknown display soil');
            weights[soil] += wx * wz;
            gradientX[soil] += dxx * wz / spacingX;
            gradientZ[soil] -= wx * dz / spacingZ;
            filtered[soil] += fx * fz;
        }
    }
    let total = 0, totalX = 0, totalZ = 0;
    for (let i = 0; i < soilCount; i++) {
        if (weights[i] <= 0) { weights[i] = 0; gradientX[i] = 0; gradientZ[i] = 0; }
        else if (weights[i] < model.positiveClampWidth) {
            const fraction = weights[i] / model.positiveClampWidth, derivative = 4 * fraction - 3 * fraction * fraction;
            weights[i] *= fraction * (2 - fraction); gradientX[i] *= derivative; gradientZ[i] *= derivative;
        }
        total += weights[i]; totalX += gradientX[i]; totalZ += gradientZ[i];
    }
    for (let i = 0; i < soilCount; i++) {
        gradientX[i] = (gradientX[i] * total - weights[i] * totalX) / (total * total);
        gradientZ[i] = (gradientZ[i] * total - weights[i] * totalZ) / (total * total);
        weights[i] /= total;
    }
    let scale = .00001, projectionX = 0, projectionY = 0;
    for (let i = 0; i < soilCount; i++) for (let j = 0; j < i; j++) {
        const differenceX = gradientX[i] - gradientX[j], differenceZ = gradientZ[i] - gradientZ[j];
        scale = Math.max(scale, Math.hypot(differenceX, differenceZ));
        projectionX = Math.max(projectionX, Math.abs(differenceX * dx[0] + differenceZ * dx[1]));
        projectionY = Math.max(projectionY, Math.abs(differenceX * dy[0] + differenceZ * dy[1]));
    }
    const rawWeights = weights.slice(), distance = [], near = [];
    for (let i = 0; i < soilCount; i++) {
        let competitor = i === 0 ? 1 : 0;
        if (soilCount === 1) { distance.push(Infinity); near.push(1); continue; }
        for (let j = 0; j < soilCount; j++) if (j !== i && weights[j] > weights[competitor]) competitor = j;
        const margin = (weights[i] - weights[competitor]) / scale;
        distance.push(margin);
        near.push(weights[i] * landscapeCoverageRampAverage(.5 + margin / model.blendWidthMeters,
            projectionX / scale / model.blendWidthMeters, projectionY / scale / model.blendWidthMeters));
    }
    const nearTotal = near.reduce((sum, value) => sum + value, 0), filteredTotal = filtered.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < soilCount; i++) weights[i] = near[i] / nearTotal * (1 - minification) + (minification > 0 ? filtered[i] / filteredTotal * minification : 0);
    return { weights, nearWeights: near.map(value => value / nearTotal), rawWeights, gradientX, gradientZ, distance, minification, footprintCells,
        filterLimited: footprintCells > model.maximumFilterWidthCells, sourceSpacing: { x: spacingX, z: spacingZ } };
}
