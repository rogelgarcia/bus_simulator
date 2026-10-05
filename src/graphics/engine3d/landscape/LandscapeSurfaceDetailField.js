// Generates deterministic fine surface-coverage pages from canonical native cover, ordered overrides and a versioned recipe.
// @ts-check
// Every texel is a function of canonical world positions derived from global integer fine indices and of canonical
// inputs only, so adjacent pages agree bit for bit on shared borders and halos; fine indices outside the landscape clamp
// to its edge exactly like D1 halos. The base field is the face of smoothed vector boundaries extracted from a canonical
// native display-label window built without authored overrides, sampled at warped positions: the nearest boundary gives
// the label, the soil across it and the exact Euclidean distance. Overrides are painted over it in order with exact
// signed distances at the same warped position, and each sample stores its nearest visible boundary whose soils differ
// (base edges hidden under an override and override edges hidden under a later one are skipped; inside an override the
// soil beyond each straight edge, or a circle's nearest point, is read just outside it). Pair profiles scale the
// distance and world-anchored breakup shifts it; the breakup fades out where boundaries of two different soil pairs are
// equally near, so per-pair displacements cannot disagree at junctions and leave speckle. The label is re-derived from
// the stored code so labels and codes never disagree. The uniform marker also requires the four cell-corner codes to be
// invalid, as in D1, so the shader fast path is exact at every footprint.
// Positions whose whole warp reach is far from every boundary and override settle to their native label without
// evaluation, which is exact by construction. Pure JavaScript: no THREE, DOM or heights.
// Native display labels of planning-only samples come from the natural-soil pages of their native owners under a v4 recipe
// (natural-terrain-inference-v1, read one owner at a time through the injected loader), or from the overview infill for owners the
// natural soil request leaves on the fallback; the resident native mask pages use the same request, so fine and native labels agree.
import { createLandscapeSurfaceDetailIndex, validateLandscapeSurfaceDetailRecipe, landscapeSurfaceDetailKey, LANDSCAPE_SURFACE_DETAIL_FORMAT } from '../../../app/landscape/LandscapeSurfaceDetail.js';
import { LANDSCAPE_NATURAL_SOIL, createLandscapeNaturalSoilResolver } from '../../../app/landscape/LandscapeNaturalSoil.js';
import { landscapeRegionBounds, landscapeRegionIntersectsBounds, landscapeRegionNearestBoundaryPoint, landscapeRegionSignedDistance } from '../../../app/landscape/LandscapeRegions.js';
import { LANDSCAPE_CONTOUR_COVERAGE } from './LandscapeContourCoverage.js';
import { LANDSCAPE_SURFACE_COVERAGE, landscapeCoverageMaskLayout } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_SURFACE_NOISE, createLandscapeNoiseOctaves, createLandscapeSurfaceWarp } from './LandscapeSurfaceNoise.js';
import { LANDSCAPE_SURFACE_BOUNDARY, createLandscapeSurfaceBoundaries, landscapeSurfaceBoundaryScratchBytes } from './LandscapeSurfaceBoundaries.js';
import { landscapeSurfacePairProfiles } from './LandscapeSurfaceDetailRecipe.js';
import { LANDSCAPE_NATURAL_PRESENTATION } from './LandscapeNaturalPresentation.js';

const FORMAT = LANDSCAPE_SURFACE_DETAIL_FORMAT;
const DISTANCE_MAX = 4095;
const INVALID = LANDSCAPE_CONTOUR_COVERAGE.invalidPair << 12;
const UNIFORM = LANDSCAPE_CONTOUR_COVERAGE.uniformSupportCode;
const NO_SOURCE = -2, BASE_SOURCE = -1;
const PAIR_LOW = new Int8Array(15), PAIR_HIGH = new Int8Array(15), PAIR_INDEX = new Int8Array(36).fill(-1);
for (let first = 0, index = 0; first < 6; first++) for (let second = first + 1; second < 6; second++, index++) {
    PAIR_LOW[index] = first; PAIR_HIGH[index] = second; PAIR_INDEX[first * 6 + second] = PAIR_INDEX[second * 6 + first] = index;
}
if (FORMAT.storedHaloSamples !== LANDSCAPE_CONTOUR_COVERAGE.storedHaloSamples || FORMAT.storedHaloSamples !== LANDSCAPE_SURFACE_COVERAGE.haloSamples
    || FORMAT.uniformMinOffset !== LANDSCAPE_CONTOUR_COVERAGE.uniformSupportMinOffset || FORMAT.uniformMaxOffset !== LANDSCAPE_CONTOUR_COVERAGE.uniformSupportMaxOffset) throw new Error('[LandscapeSurfaceDetail] fine page format diverges from the D1 coverage format');

/** @typedef {{originColumn:number,originRow:number,width:number,height:number,labels:Uint8Array,codes:Uint16Array,minX:number,maxZ:number,spacingX:number,spacingZ:number,clampMinColumn:number,clampMaxColumn:number,clampMinRow:number,clampMaxRow:number,soilCount:number}} LandscapeCoverageWindow */

function fail(message) { throw new Error(`[LandscapeSurfaceDetail] ${message}`); }

function ramp(center) {
    if (center <= 0) return 0;
    if (center >= 1) return 1;
    return center * center * (3 - 2 * center);
}

function validateWindow(input) {
    const window = { ...input };
    if (!['originColumn', 'originRow', 'width', 'height', 'clampMinColumn', 'clampMaxColumn', 'clampMinRow', 'clampMaxRow', 'soilCount'].every(key => Number.isSafeInteger(window[key]))
        || window.width < 4 || window.height < 4 || window.clampMaxColumn <= window.clampMinColumn || window.clampMaxRow <= window.clampMinRow
        || window.soilCount < 1 || window.soilCount > 6 || !(window.labels instanceof Uint8Array) || !(window.codes instanceof Uint16Array)
        || window.labels.length !== window.width * window.height || window.codes.length !== window.labels.length
        || ![window.minX, window.maxZ].every(Number.isFinite) || ![window.spacingX, window.spacingZ].every(value => Number.isFinite(value) && value > 0)) fail('near-field window needs integer extents, complete label/code arrays, positive spacing and one to six soils');
    for (let i = 0; i < window.labels.length; i++) if (window.labels[i] >= window.soilCount) fail('near-field window contains an unknown display soil');
    return window;
}

/**
 * Allocation-free D1 near-field coverage at zero footprint (cubic one-hot field, margin ramp and grouped contour pairs)
 * over a D1-layout window in its own grid; reproduces sampleLandscapeSurfaceCoverage + applyLandscapeContourCoverage.
 * @param {LandscapeCoverageWindow} input
 */
export function createLandscapeNearFieldEvaluator(input) {
    const { originColumn, originRow, width, height, labels, codes, minX, maxZ, spacingX, spacingZ, clampMinColumn, clampMaxColumn, clampMinRow, clampMaxRow, soilCount } = validateWindow(input);
    const weights = new Float64Array(6), gradientX = new Float64Array(6), gradientZ = new Float64Array(6), near = new Float64Array(6);
    const groupPair = new Int32Array(4), groupConfidence = new Float64Array(4), groupNumerator = new Float64Array(4);
    const blend = LANDSCAPE_SURFACE_COVERAGE.blendWidthMeters, clampWidth = LANDSCAPE_SURFACE_COVERAGE.positiveClampWidth;
    const rangeSamples = LANDSCAPE_CONTOUR_COVERAGE.distanceRangeSamples, spacingMax = Math.max(spacingX, spacingZ);

    /** @param {number} x @param {number} z @param {Float64Array} out @returns {Float64Array} */
    function evaluate(x, z, out) {
        const gx = Math.max(clampMinColumn, Math.min(clampMaxColumn, (x - minX) / spacingX)), gz = Math.max(clampMinRow, Math.min(clampMaxRow, (maxZ - z) / spacingZ));
        const cellX = Math.floor(gx), cellZ = Math.floor(gz), localX = cellX - originColumn, localZ = cellZ - originRow;
        if (!(localX >= 1 && localZ >= 1 && localX + 2 < width && localZ + 2 < height)) fail(`near-field position ${x},${z} lies outside its canonical support window`);
        for (let i = 0; i < 6; i++) out[i] = 0;
        const anchor = localZ * width + localX;
        if (codes[anchor] === UNIFORM) { out[labels[anchor]] = 1; return out; }
        for (let i = 0; i < 6; i++) { weights[i] = 0; gradientX[i] = 0; gradientZ[i] = 0; }
        for (let row = -1; row <= 2; row++) {
            const valueZ = gz - cellZ - row, z1 = Math.abs(valueZ), signZ = Math.sign(valueZ);
            let wz = 0, dz = 0;
            if (z1 < 1) { wz = 1 - 2.5 * z1 * z1 + 1.5 * z1 * z1 * z1; dz = signZ * (-5 * z1 + 4.5 * z1 * z1); }
            else if (z1 < 2) { wz = 2 - 4 * z1 + 2.5 * z1 * z1 - .5 * z1 * z1 * z1; dz = signZ * (-4 + 5 * z1 - 1.5 * z1 * z1); }
            const base = (localZ + row) * width + localX;
            for (let column = -1; column <= 2; column++) {
                const valueX = gx - cellX - column, x1 = Math.abs(valueX), signX = Math.sign(valueX);
                let wx = 0, dx = 0;
                if (x1 < 1) { wx = 1 - 2.5 * x1 * x1 + 1.5 * x1 * x1 * x1; dx = signX * (-5 * x1 + 4.5 * x1 * x1); }
                else if (x1 < 2) { wx = 2 - 4 * x1 + 2.5 * x1 * x1 - .5 * x1 * x1 * x1; dx = signX * (-4 + 5 * x1 - 1.5 * x1 * x1); }
                if (wx * wz === 0 && dx * wz === 0 && wx * dz === 0) continue;
                const soil = labels[base + column];
                weights[soil] += wx * wz;
                gradientX[soil] += dx * wz / spacingX;
                gradientZ[soil] -= wx * dz / spacingZ;
            }
        }
        let total = 0, totalX = 0, totalZ = 0;
        for (let i = 0; i < soilCount; i++) {
            if (weights[i] <= 0) { weights[i] = 0; gradientX[i] = 0; gradientZ[i] = 0; }
            else if (weights[i] < clampWidth) {
                const fraction = weights[i] / clampWidth, derivative = 4 * fraction - 3 * fraction * fraction;
                weights[i] *= fraction * (2 - fraction); gradientX[i] *= derivative; gradientZ[i] *= derivative;
            }
            total += weights[i]; totalX += gradientX[i]; totalZ += gradientZ[i];
        }
        for (let i = 0; i < soilCount; i++) {
            gradientX[i] = (gradientX[i] * total - weights[i] * totalX) / (total * total);
            gradientZ[i] = (gradientZ[i] * total - weights[i] * totalZ) / (total * total);
            weights[i] /= total;
        }
        let scale = .00001;
        for (let i = 0; i < soilCount; i++) for (let j = 0; j < i; j++) {
            const differenceX = gradientX[i] - gradientX[j], differenceZ = gradientZ[i] - gradientZ[j];
            scale = Math.max(scale, Math.sqrt(differenceX * differenceX + differenceZ * differenceZ));
        }
        let nearTotal = 0;
        for (let i = 0; i < soilCount; i++) {
            if (soilCount === 1) { near[i] = 1; nearTotal += 1; continue; }
            let competitor = i === 0 ? 1 : 0;
            for (let j = 0; j < soilCount; j++) if (j !== i && weights[j] > weights[competitor]) competitor = j;
            near[i] = weights[i] * ramp(.5 + (weights[i] - weights[competitor]) / scale / blend);
            nearTotal += near[i];
        }
        const column = Math.min(cellX, clampMaxColumn - 1), row = Math.min(cellZ, clampMaxRow - 1), tx = gx - column, tz = gz - row;
        let groups = 0, confidence = 0;
        for (let cornerZ = 0; cornerZ < 2; cornerZ++) for (let cornerX = 0; cornerX < 2; cornerX++) {
            const code = codes[(row + cornerZ - originRow) * width + column + cornerX - originColumn], pair = code >> 12;
            if (pair === LANDSCAPE_CONTOUR_COVERAGE.invalidPair) continue;
            const weight = (cornerX ? tx : 1 - tx) * (cornerZ ? tz : 1 - tz), distance = ((code & DISTANCE_MAX) / DISTANCE_MAX * 2 - 1) * rangeSamples * spacingMax;
            let group = 0;
            while (group < groups && groupPair[group] !== pair) group++;
            if (group === groups) { groupPair[group] = pair; groupConfidence[group] = 0; groupNumerator[group] = 0; groups++; }
            groupConfidence[group] += weight; groupNumerator[group] += weight * distance;
        }
        for (let group = 0; group < groups; group++) if (groupConfidence[group] > 0) confidence += groupConfidence[group];
        for (let i = 0; i < soilCount; i++) { const value = near[i] / nearTotal; out[i] = value - value * confidence; }
        for (let group = 0; group < groups; group++) {
            const groupWeight = groupConfidence[group];
            if (!(groupWeight > 0)) continue;
            const high = ramp(.5 + groupNumerator[group] / groupWeight / blend);
            out[PAIR_LOW[groupPair[group]]] += groupWeight * (1 - high);
            out[PAIR_HIGH[groupPair[group]]] += groupWeight * high;
        }
        return out;
    }

    return Object.freeze({ evaluate, soilCount });
}

function requireSupportedRecipe(recipe) {
    if (recipe.transitionReferenceWidth !== LANDSCAPE_SURFACE_COVERAGE.blendWidthMeters) fail(`recipe ${recipe.id} must use the shader's ${LANDSCAPE_SURFACE_COVERAGE.blendWidthMeters} m transition ramp`);
    const boundary = recipe.boundary;
    if (![LANDSCAPE_NATURAL_PRESENTATION, LANDSCAPE_NATURAL_SOIL.terrain].includes(recipe.base.labels) || recipe.base.boundary !== LANDSCAPE_SURFACE_BOUNDARY.id || recipe.base.encoding !== LANDSCAPE_CONTOUR_COVERAGE.id
        || boundary.saddle !== LANDSCAPE_SURFACE_BOUNDARY.saddle || boundary.smoothing !== LANDSCAPE_SURFACE_BOUNDARY.smoothing || boundary.kernel !== LANDSCAPE_SURFACE_BOUNDARY.kernel
        || recipe.labelTies !== 'lower-soil-index' || recipe.distance !== 'warped-nearest-boundary'
        || recipe.warp.noise !== LANDSCAPE_SURFACE_NOISE.id || recipe.breakup.noise !== LANDSCAPE_SURFACE_NOISE.id) fail(`recipe ${recipe.id} names an unsupported label, boundary, encoding, tie, distance or noise algorithm`);
}

// straight boundary pieces of a rectangle or polygon as [ax, az, bx, bz] rows, in the edge order of the signed distance
function regionEdges(region) {
    const points = region.type === 'rectangle' ? [{ x: region.minX, z: region.minZ }, { x: region.maxX, z: region.minZ }, { x: region.maxX, z: region.maxZ }, { x: region.minX, z: region.maxZ }]
        : region.type === 'polygon' ? region.points : null;
    if (!points) return null;
    const edges = new Float64Array(points.length * 4);
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) edges.set([points[j].x, points[j].z, points[i].x, points[i].z], i * 4);
    return edges;
}

function prepareContext({ manifest, descriptor, recipe: recipeInput, seed, presentation, natural = null }) {
    const recipe = validateLandscapeSurfaceDetailRecipe(recipeInput);
    requireSupportedRecipe(recipe);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) fail('seed must be an unsigned 32-bit integer');
    const index = createLandscapeSurfaceDetailIndex(manifest, { levels: recipe.levels }), validated = index.manifest;
    const page = index.descriptor(typeof descriptor === 'string' ? descriptor : descriptor?.id);
    if (typeof descriptor !== 'string' && (descriptor.level !== page.level || descriptor.column !== page.column || descriptor.row !== page.row)) fail(`descriptor ${page.id} does not match its derived address`);
    if (recipe.base.labels !== LANDSCAPE_NATURAL_SOIL.terrain && natural) fail(`recipe ${recipe.id} uses ${recipe.base.labels} labels and cannot read natural soil requests`);
    const naturalSoil = createLandscapeNaturalSoilResolver(validated, recipe.base.labels === LANDSCAPE_NATURAL_SOIL.terrain ? natural : null);
    const support = index.support(page, recipe), soilIds = validated.soil.catalog.map(soil => soil.id), soilCount = soilIds.length;
    if (soilCount > 6) fail('fine coverage pages support at most six display soils');
    const overview = validated.chunks.find(chunk => chunk.id === validated.overviewId);
    if (typeof presentation?.sampleBase !== 'function' || typeof presentation.semanticSoil !== 'function' || presentation.reference?.policy !== LANDSCAPE_NATURAL_PRESENTATION
        || presentation.reference.sourceHash !== overview.channels.landCover.sha256) fail('presentation must be the natural overview infill of this landscape');
    const spacingX = support.spacing.x, spacingZ = support.spacing.z, range = LANDSCAPE_CONTOUR_COVERAGE.distanceRangeSamples * Math.max(spacingX, spacingZ);
    if (range < recipe.transitionReferenceWidth / 2) fail(`level ${page.level} spacing cannot encode the ${recipe.transitionReferenceWidth} m transition ramp`);
    const profiles = landscapeSurfacePairProfiles(recipe, soilIds), profileScale = new Float64Array(15), profileBreakup = new Float64Array(15);
    profiles.forEach((profile, pair) => { if (profile) { profileScale[pair] = recipe.transitionReferenceWidth / profile.widthMeters; profileBreakup[pair] = profile.breakup; } });
    const reach = support.searchRadiusMeters + FORMAT.overrideProbeMeters;
    const overrides = validated.soil.overrides.filter(override => landscapeRegionIntersectsBounds(override.region, support.influenceBounds)).map(override => {
        const bounds = landscapeRegionBounds(override.region), soil = soilIds.indexOf(override.soilId);
        if (soil < 0) fail(`override ${override.id} names an unknown soil`);
        return Object.freeze({ id: override.id, region: override.region, soil, edges: regionEdges(override.region), bounds: Object.freeze(bounds),
            minX: bounds.minX - reach, maxX: bounds.maxX + reach, minZ: bounds.minZ - reach, maxZ: bounds.maxZ + reach });
    });
    return {
        recipe, seed, index, manifest: validated, page, support, soilIds, soilCount, presentation, naturalSoil, spacingX, spacingZ, range, profiles, profileScale, profileBreakup, overrides,
        warp: createLandscapeSurfaceWarp({ seed, wavelengths: [...recipe.warp.wavelengths], amplitudes: [...recipe.warp.amplitudes], shaping: recipe.warp.shaping }),
        breakup: createLandscapeNoiseOctaves({ seed, component: 2, wavelengths: [...recipe.breakup.wavelengths], amplitudes: [...recipe.breakup.amplitudes],
            minimumWavelength: recipe.octaveMinimumSamples * Math.max(spacingX, spacingZ), shaping: recipe.breakup.shaping,
            ridgedMix: recipe.breakup.shaping === 'ridged-mix' ? recipe.breakup.ridgedMix : 0 }),
        inputs: index.inputs(page, recipe, seed, natural)
    };
}

async function loadSupport(context, loadCover, loadNatural) {
    if (typeof loadCover !== 'function') fail('loadCover must be a function returning authenticated native cover');
    const { manifest, support, presentation, naturalSoil } = context, grid = manifest.grid, bounds = manifest.bounds, window = support.native.window, count = 2 ** grid.maxLevel;
    const width = window.maxColumn - window.minColumn + 1, height = window.maxRow - window.minRow + 1;
    const columnIndex = new Int32Array(width), columnOwner = new Int32Array(width), rowIndex = new Int32Array(height), rowOwner = new Int32Array(height);
    for (let column = 0; column < width; column++) {
        columnIndex[column] = Math.max(0, Math.min(grid.columns - 1, window.minColumn + column));
        columnOwner[column] = Math.min(count - 1, Math.floor(columnIndex[column] / grid.chunkIntervals));
    }
    for (let row = 0; row < height; row++) {
        rowIndex[row] = Math.max(0, Math.min(grid.rows - 1, window.minRow + row));
        rowOwner[row] = Math.min(count - 1, Math.floor(rowIndex[row] / grid.chunkIntervals));
    }
    const labels = new Uint8Array(width * height), covers = new Uint8Array(width * height), sourceIds = [], naturalIds = [];
    let filled = 0;
    for (const owner of support.owners) {
        const chunk = manifest.chunks.find(value => value.id === owner.id), cover = (await loadCover(owner.id))?.landCover;
        if (!(cover instanceof Uint8Array) || cover.length !== chunk.columns * chunk.rows) fail(`invalid canonical cover support ${owner.id}`);
        const natural = await naturalSoil.load(chunk, loadNatural);
        if (natural) naturalIds.push(owner.id);
        sourceIds.push(owner.id);
        for (let row = 0; row < height; row++) {
            if (rowOwner[row] !== chunk.row) continue;
            const globalRow = rowIndex[row], z = bounds.maxZ - globalRow * grid.spacingZ, offset = (globalRow - chunk.startRow) * chunk.columns - chunk.startColumn;
            for (let column = 0; column < width; column++) {
                if (columnOwner[column] !== chunk.column) continue;
                const globalColumn = columnIndex[column], coverId = cover[offset + globalColumn], at = row * width + column;
                labels[at] = presentation.sampleBase(bounds.minX + globalColumn * grid.spacingX, z, coverId, naturalSoil.label(natural, chunk, globalColumn, globalRow)) >> 4;
                covers[at] = coverId;
                filled++;
            }
        }
    }
    if (filled !== width * height) fail(`canonical support of ${context.page.id} was not completely owned`);
    let uniform = true;
    for (let i = 1; i < labels.length && uniform; i++) uniform = labels[i] === labels[0];
    return { sourceIds, naturalIds, labels, covers, width, height, uniform, boundaries: null,
        scratchBytes: labels.byteLength + covers.byteLength + 4 * (columnIndex.length + columnOwner.length + rowIndex.length + rowOwner.length) };
}

function buildBoundaries(context, native) {
    const { manifest, support, recipe, soilCount } = context, window = support.native.window;
    native.boundaries = createLandscapeSurfaceBoundaries({ labels: native.labels, width: native.width, height: native.height, originColumn: window.minColumn, originRow: window.minRow,
        minX: manifest.bounds.minX, maxZ: manifest.bounds.maxZ, spacingX: manifest.grid.spacingX, spacingZ: manifest.grid.spacingZ, soilCount,
        farDistance: support.queryRadiusMeters, parameters: recipe.boundary });
    return native.boundaries;
}

const SAMPLER_SCRATCH_BYTES = 4 * 2 * 8 + 2 * 4 + 2 * 12;

function smooth01(value) { return value <= 0 ? 0 : value >= 1 ? 1 : value * value * (3 - 2 * value); }
function pairKey(a, b) { return a < b ? a * 16 + b : b * 16 + a; }

function createSampler(context, native) {
    const { support, overrides, warp, breakup, profileScale, profileBreakup, range } = context, boundaries = native.boundaries;
    const searchRadius = support.searchRadiusMeters, queryRadius = support.queryRadiusMeters, reach = support.maxWarpMeters + 1e-6, probe = FORMAT.overrideProbeMeters;
    const fade = context.recipe.breakup.junctionFadeMeters;
    const warpOut = new Float64Array(2), point = new Float64Array(2), nearest = new Float64Array(2), second = new Float64Array(2), labels = new Int32Array(2), signed = new Float64Array(overrides.length);
    const candidateDistance = new Float64Array(overrides.length + 2), candidateKey = new Int32Array(overrides.length + 2);
    const maxEdges = Math.max(1, ...overrides.map(override => override.edges ? override.edges.length / 4 : 1));
    const edgeDistance = new Float64Array(maxEdges), edgeX = new Float64Array(maxEdges), edgeZ = new Float64Array(maxEdges);
    const state = { warpX: 0, warpZ: 0, label: 0, other: -1, distance: Infinity, second: Infinity, source: NO_SOURCE, pair: -1, signedDistance: 0, fade: 1, breakup: 0, coordinate: 0, finalLabel: 0, code: INVALID };
    let candidates = 0;

    function settled(x, z) {
        for (let k = 0; k < overrides.length; k++) {
            const override = overrides[k];
            if (x + reach >= override.minX && x - reach <= override.maxX && z + reach >= override.minZ && z - reach <= override.maxZ) return -1;
        }
        return boundaries.settledLabel(x - reach, x + reach, z - reach, z + reach);
    }

    function hiddenAbove(layer, qx, qz) {
        for (let k = layer + 1; k < overrides.length; k++) {
            const bounds = overrides[k].bounds;
            if (qx >= bounds.minX && qx <= bounds.maxX && qz >= bounds.minZ && qz <= bounds.maxZ && landscapeRegionSignedDistance(overrides[k].region, qx, qz) > 0) return true;
        }
        return false;
    }

    function soilBelow(layer, qx, qz) {
        for (let k = layer - 1; k >= 0; k--) {
            const bounds = overrides[k].bounds;
            if (qx >= bounds.minX && qx <= bounds.maxX && qz >= bounds.minZ && qz <= bounds.maxZ && landscapeRegionSignedDistance(overrides[k].region, qx, qz) >= 0) return overrides[k].soil;
        }
        boundaries.query(qx, qz, queryRadius, labels);
        return labels[0];
    }

    function candidate(distance, key) { candidateDistance[candidates] = distance; candidateKey[candidates] = key; candidates++; }

    // inside the top override: its boundary pieces in increasing distance until one is visible with a different soil beyond it
    function insideCandidate(top, px, pz) {
        const override = overrides[top], edges = override.edges;
        let count = 0;
        if (edges) {
            for (let e = 0; e < edges.length; e += 4) {
                const ax = edges[e], az = edges[e + 1], ex = edges[e + 2] - ax, ez = edges[e + 3] - az;
                const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez))), qx = ax + t * ex, qz = az + t * ez;
                const distance = Math.sqrt((px - qx) * (px - qx) + (pz - qz) * (pz - qz));
                if (!(distance <= searchRadius)) continue;
                let k = count++;
                while (k > 0 && edgeDistance[k - 1] > distance) { edgeDistance[k] = edgeDistance[k - 1]; edgeX[k] = edgeX[k - 1]; edgeZ[k] = edgeZ[k - 1]; k--; }
                edgeDistance[k] = distance; edgeX[k] = qx; edgeZ[k] = qz;
            }
        } else {
            landscapeRegionNearestBoundaryPoint(override.region, px, pz, nearest);
            edgeDistance[0] = signed[top]; edgeX[0] = nearest[0]; edgeZ[0] = nearest[1]; count = 1;
        }
        for (let k = 0; k < count; k++) {
            const qx = edgeX[k], qz = edgeZ[k], dx = qx - px, dz = qz - pz, length = Math.sqrt(dx * dx + dz * dz);
            if (hiddenAbove(top, qx, qz)) continue;
            const beneath = length > 0 ? soilBelow(top, qx + dx / length * probe, qz + dz / length * probe) : soilBelow(top, qx, qz);
            if (beneath === state.label) continue;
            candidate(edgeDistance[k], pairKey(state.label, beneath));
            state.distance = edgeDistance[k]; state.other = beneath; state.source = top;
            return;
        }
    }

    function overrideCandidates(first, px, pz) {
        for (let k = first; k < overrides.length; k++) {
            const distance = 0 - signed[k];
            if (!(distance <= searchRadius + probe) || overrides[k].soil === state.label) continue;
            candidate(distance, pairKey(state.label, overrides[k].soil));
            if (!(distance <= searchRadius) || !(distance < state.distance)) continue;
            landscapeRegionNearestBoundaryPoint(overrides[k].region, px, pz, nearest);
            if (hiddenAbove(k, nearest[0], nearest[1])) continue;
            state.distance = distance; state.other = overrides[k].soil; state.source = k;
        }
    }

    // painted label at a warped position, its nearest visible boundary with a different soil inside the search radius and
    // the distance to the nearest boundary of any other soil pair (junction fade of the breakup)
    function composite(px, pz) {
        let top = -1;
        for (let k = overrides.length - 1; k >= 0; k--) {
            const override = overrides[k];
            signed[k] = px < override.minX || px > override.maxX || pz < override.minZ || pz > override.maxZ ? -Infinity : landscapeRegionSignedDistance(override.region, px, pz);
            if (top < 0 && signed[k] >= 0) top = k;
        }
        state.other = -1; state.distance = Infinity; state.second = Infinity; state.source = NO_SOURCE; candidates = 0;
        if (top < 0) {
            const distance = boundaries.query(px, pz, queryRadius, labels, point, second, fade);
            state.label = labels[0];
            if (labels[1] >= 0 && labels[1] !== labels[0]) {
                candidate(distance, pairKey(labels[0], labels[1]));
                candidate(second[0], -1);
                if (distance <= searchRadius && !hiddenAbove(BASE_SOURCE, point[0], point[1])) { state.distance = distance; state.other = labels[1]; state.source = BASE_SOURCE; }
            }
            overrideCandidates(0, px, pz);
        } else {
            state.label = overrides[top].soil;
            if (signed[top] <= searchRadius) insideCandidate(top, px, pz);
            overrideCandidates(top + 1, px, pz);
        }
        if (state.other >= 0) {
            const winner = pairKey(state.label, state.other);
            for (let k = 0; k < candidates; k++) if (candidateKey[k] !== winner && candidateDistance[k] < state.second) state.second = candidateDistance[k];
        }
        return state;
    }

    function sample(x, z) {
        warp.evaluate(x, z, warpOut);
        state.warpX = warpOut[0]; state.warpZ = warpOut[1];
        composite(x + warpOut[0], z + warpOut[1]);
        if (state.other >= 0 && state.distance <= searchRadius) {
            const pair = PAIR_INDEX[state.label * 6 + state.other], high = PAIR_HIGH[pair], signedDistance = state.label === high ? state.distance : -state.distance;
            const fadeFactor = smooth01((state.second - state.distance) / fade), breakupMeters = fadeFactor * profileBreakup[pair] * breakup.evaluate(x, z);
            const coordinate = (signedDistance + breakupMeters) * profileScale[pair], code = Math.round((Math.max(-1, Math.min(1, coordinate / range)) + 1) * DISTANCE_MAX / 2);
            state.pair = pair; state.signedDistance = signedDistance; state.fade = fadeFactor; state.breakup = breakupMeters; state.coordinate = coordinate;
            state.finalLabel = code >= 2048 ? high : PAIR_LOW[pair]; state.code = pair << 12 | code;
        } else { state.pair = -1; state.signedDistance = 0; state.fade = 1; state.breakup = 0; state.coordinate = 0; state.finalLabel = state.label; state.code = INVALID; }
        return state;
    }

    return { settled, sample, state, scratchBytes: warpOut.byteLength + point.byteLength + nearest.byteLength + second.byteLength + labels.byteLength + signed.byteLength
        + candidateDistance.byteLength + candidateKey.byteLength + edgeDistance.byteLength + edgeX.byteLength + edgeZ.byteLength };
}

function evaluateSamples(context, native, window) {
    const { support, spacingX, spacingZ } = context, { fineColumns, fineRows } = support, minX = context.manifest.bounds.minX, maxZ = context.manifest.bounds.maxZ;
    const width = window.maxColumn - window.minColumn + 1, height = window.maxRow - window.minRow + 1, labels = new Uint8Array(width * height), codes = new Uint16Array(width * height);
    const sampler = createSampler(context, native);
    let settledSamples = 0, evaluatedSamples = 0;
    for (let r = Math.max(0, window.minRow); r <= Math.min(fineRows - 1, window.maxRow); r++) {
        const z = maxZ - r * spacingZ, offset = (r - window.minRow) * width - window.minColumn;
        for (let c = Math.max(0, window.minColumn); c <= Math.min(fineColumns - 1, window.maxColumn); c++) {
            const x = minX + c * spacingX, soil = sampler.settled(x, z);
            if (soil >= 0) { labels[offset + c] = soil; codes[offset + c] = INVALID; settledSamples++; continue; }
            const state = sampler.sample(x, z);
            labels[offset + c] = state.finalLabel; codes[offset + c] = state.code; evaluatedSamples++;
        }
    }
    const clampColumn = c => c < 0 ? 0 : c >= fineColumns ? fineColumns - 1 : c, clampRow = r => r < 0 ? 0 : r >= fineRows ? fineRows - 1 : r;
    for (let r = window.minRow; r <= window.maxRow; r++) for (let c = window.minColumn; c <= window.maxColumn; c++) {
        if (c === clampColumn(c) && r === clampRow(r)) continue;
        const to = (r - window.minRow) * width + c - window.minColumn, from = (clampRow(r) - window.minRow) * width + clampColumn(c) - window.minColumn;
        labels[to] = labels[from]; codes[to] = codes[from];
    }
    return { labels, codes, width, height, settledSamples, evaluatedSamples, scratchBytes: labels.byteLength + codes.byteLength + sampler.scratchBytes };
}

// D1-format encoding with exact unwarped semantics, nearest native cover and the uniform fast-path marker
function encode(context, native, output, window, samples) {
    const { support, spacingX, spacingZ, presentation } = context, { fineColumns, fineRows, ratio } = support, nativeWindow = support.native.window;
    const minX = context.manifest.bounds.minX, maxZ = context.manifest.bounds.maxZ, { labels, codes } = samples, labelsWidth = samples.width, half = ratio / 2;
    const outputWidth = output.maxColumn - output.minColumn + 1, outputHeight = output.maxRow - output.minRow + 1, pixels = new Uint8Array(outputWidth * outputHeight * 4), soils = new Set();
    for (let r = Math.max(0, output.minRow); r <= Math.min(fineRows - 1, output.maxRow); r++) {
        const coverRow = (Math.floor((r + half) / ratio) - nativeWindow.minRow) * native.width - nativeWindow.minColumn;
        for (let c = Math.max(0, output.minColumn); c <= Math.min(fineColumns - 1, output.maxColumn); c++) {
            const at = (r - window.minRow) * labelsWidth + c - window.minColumn, label = labels[at];
            let uniform = codes[at] === INVALID && codes[at + 1] === INVALID && codes[at + labelsWidth] === INVALID && codes[at + labelsWidth + 1] === INVALID;
            for (let dr = FORMAT.uniformMinOffset; uniform && dr <= FORMAT.uniformMaxOffset; dr++) {
                for (let dc = FORMAT.uniformMinOffset; dc <= FORMAT.uniformMaxOffset; dc++) if (labels[at + dr * labelsWidth + dc] !== label) { uniform = false; break; }
            }
            const code = uniform ? UNIFORM : codes[at], cover = native.covers[coverRow + Math.floor((c + half) / ratio)];
            const semantic = presentation.semanticSoil(minX + c * spacingX, maxZ - r * spacingZ, cover), target = ((r - output.minRow) * outputWidth + c - output.minColumn) * 4;
            pixels[target] = semantic | label << 4; pixels[target + 1] = cover; pixels[target + 2] = code & 255; pixels[target + 3] = code >> 8;
            soils.add(label);
            if (code >> 12 !== LANDSCAPE_CONTOUR_COVERAGE.invalidPair) { soils.add(PAIR_LOW[code >> 12]); soils.add(PAIR_HIGH[code >> 12]); }
        }
    }
    const clampColumn = c => c < 0 ? 0 : c >= fineColumns ? fineColumns - 1 : c, clampRow = r => r < 0 ? 0 : r >= fineRows ? fineRows - 1 : r;
    for (let r = output.minRow; r <= output.maxRow; r++) for (let c = output.minColumn; c <= output.maxColumn; c++) {
        if (c === clampColumn(c) && r === clampRow(r)) continue;
        const from = ((clampRow(r) - output.minRow) * outputWidth + clampColumn(c) - output.minColumn) * 4;
        pixels.copyWithin(((r - output.minRow) * outputWidth + c - output.minColumn) * 4, from, from + 4);
    }
    return { pixels, soils };
}

function uniformPage(context, native, output) {
    const { support, spacingX, spacingZ, presentation } = context, { fineColumns, fineRows, ratio } = support, nativeWindow = support.native.window;
    const minX = context.manifest.bounds.minX, maxZ = context.manifest.bounds.maxZ, soil = native.labels[0], half = ratio / 2;
    const outputWidth = output.maxColumn - output.minColumn + 1, outputHeight = output.maxRow - output.minRow + 1, pixels = new Uint8Array(outputWidth * outputHeight * 4);
    for (let r = output.minRow; r <= output.maxRow; r++) for (let c = output.minColumn; c <= output.maxColumn; c++) {
        const sampleColumn = Math.max(0, Math.min(fineColumns - 1, c)), sampleRow = Math.max(0, Math.min(fineRows - 1, r)), target = ((r - output.minRow) * outputWidth + c - output.minColumn) * 4;
        const cover = native.covers[(Math.floor((sampleRow + half) / ratio) - nativeWindow.minRow) * native.width + Math.floor((sampleColumn + half) / ratio) - nativeWindow.minColumn];
        pixels[target] = presentation.semanticSoil(minX + sampleColumn * spacingX, maxZ - sampleRow * spacingZ, cover) | soil << 4;
        pixels[target + 1] = cover; pixels[target + 2] = UNIFORM & 255; pixels[target + 3] = UNIFORM >> 8;
    }
    return { pixels, soils: new Set([soil]) };
}

/**
 * Generates one fine coverage page in the exact D1 mask layout ((columns+4)x(rows+4) RGBA8 with a two-sample halo).
 * The only data access is the injected loadCover(nativeChunkId) => {landCover} and, for owners the natural soil request keeps on the
 * terrain-driven labels, loadNatural(entry, url) => authenticated natural-soil page bytes; no heights are requested.
 * @param {{manifest:any,descriptor:any,recipe:any,seed:number,presentation:any,loadCover:(id:string)=>Promise<{landCover:Uint8Array}>,natural?:any,
 *   loadNatural?:(entry:{url:string,sha256:string,byteLength:number},url:string)=>Promise<Uint8Array>}} options natural is the landscape-natural-soil-request of the
 *   support owners (null: every owner keeps the overview infill)
 */
export async function createLandscapeSurfaceDetailPage(options) {
    const started = performance.now(), context = prepareContext(options), windows = context.support.windows;
    const native = await loadSupport(context, options.loadCover, options.loadNatural), loaded = performance.now(), shortcut = native.uniform && !context.overrides.length;
    let result, boundaries = null, samples = null, built = loaded, sampled = loaded;
    if (shortcut) result = uniformPage(context, native, windows.output);
    else {
        boundaries = buildBoundaries(context, native); built = performance.now();
        samples = evaluateSamples(context, native, windows.labels); sampled = performance.now();
        result = encode(context, native, windows.output, windows.labels, samples);
    }
    const finished = performance.now(), layout = landscapeCoverageMaskLayout(context.page);
    if (result.pixels.byteLength !== layout.pageBytes) fail(`page ${context.page.id} does not match the D1 mask layout`);
    let uniformSoil = result.pixels[0] >> 4;
    for (let offset = 0; offset < result.pixels.length && uniformSoil >= 0; offset += 4) {
        if (result.pixels[offset] >> 4 !== uniformSoil || (result.pixels[offset + 2] | result.pixels[offset + 3] << 8) !== UNIFORM) uniformSoil = -1;
    }
    return Object.freeze({
        pixels: result.pixels, soils: Object.freeze([...result.soils].sort((a, b) => a - b)), sourceIds: Object.freeze(native.sourceIds),
        metadata: Object.freeze({
            id: context.page.id, generated: true, measured: false, level: context.page.level, spacing: context.support.spacing,
            searchRadius: context.support.searchRadius, searchRadiusMeters: context.support.searchRadiusMeters,
            recipe: Object.freeze({ id: context.recipe.id, hash: context.inputs.recipe.hash }), seed: context.seed, key: landscapeSurfaceDetailKey(context.inputs), inputs: context.inputs,
            naturalSoilIds: Object.freeze([...native.naturalIds]), uniform: uniformSoil >= 0, uniformSoil, shortcut,
            boundary: Object.freeze(boundaries ? { segments: boundaries.segmentCount, rawSegments: boundaries.rawSegmentCount, chains: boundaries.chainCount, loops: boundaries.loopCount }
                : { segments: 0, rawSegments: 0, chains: 0, loops: 0 }),
            settledSamples: samples ? samples.settledSamples : 0, evaluatedSamples: samples ? samples.evaluatedSamples : 0,
            scratchBytes: native.scratchBytes + (boundaries ? boundaries.scratchBytes : 0) + (samples ? samples.scratchBytes : 0) + result.pixels.byteLength,
            coverAllowanceBytes: native.sourceIds.length * (context.manifest.grid.chunkIntervals + 1) ** 2,
            timingsMs: Object.freeze({ support: loaded - started, boundaries: built - loaded, samples: sampled - built, encode: finished - sampled, total: finished - started })
        })
    });
}

/**
 * Point inspection of the generator internals at a world position inside a fine page's stored extent: warp, base face
 * and painted label at the point with its nearest boundary, plus the nearest fine sample's pair, source, distance,
 * profile, breakup and stored texel.
 * @param {{manifest:any,descriptor:any,recipe:any,seed:number,presentation:any,loadCover:(id:string)=>Promise<{landCover:Uint8Array}>,natural?:any,
 *   loadNatural?:(entry:{url:string,sha256:string,byteLength:number},url:string)=>Promise<Uint8Array>,x:number,z:number}} options
 */
export async function sampleLandscapeSurfaceDetail(options) {
    const { x, z } = options;
    if (!Number.isFinite(x) || !Number.isFinite(z)) fail('inspection coordinates must be finite');
    const context = prepareContext(options), { support, spacingX, spacingZ, soilIds } = context;
    const bounds = context.manifest.bounds, output = support.windows.output;
    const column = Math.floor((x - bounds.minX) / spacingX + .5), row = Math.floor((bounds.maxZ - z) / spacingZ + .5);
    if (column < output.minColumn || column > output.maxColumn || row < output.minRow || row > output.maxRow) fail(`inspection point ${x},${z} lies outside page ${context.page.id}`);
    const native = await loadSupport(context, options.loadCover, options.loadNatural), boundaries = buildBoundaries(context, native), sampler = createSampler(context, native);
    const point = { ...sampler.sample(x, z) }, warpedX = x + point.warpX, warpedZ = z + point.warpZ, baseLabels = new Int32Array(2);
    const baseDistance = boundaries.query(warpedX, warpedZ, support.queryRadiusMeters, baseLabels);
    const sampleColumn = Math.max(0, Math.min(support.fineColumns - 1, column)), sampleRow = Math.max(0, Math.min(support.fineRows - 1, row));
    const sampleX = bounds.minX + sampleColumn * spacingX, sampleZ = bounds.maxZ - sampleRow * spacingZ, trace = { ...sampler.sample(sampleX, sampleZ) };
    const cell = { minColumn: sampleColumn, maxColumn: sampleColumn, minRow: sampleRow, maxRow: sampleRow };
    const window = { minColumn: sampleColumn + FORMAT.uniformMinOffset, maxColumn: sampleColumn + FORMAT.uniformMaxOffset, minRow: sampleRow + FORMAT.uniformMinOffset, maxRow: sampleRow + FORMAT.uniformMaxOffset };
    const texel = [...encode(context, native, cell, window, evaluateSamples(context, native, window)).pixels];
    const code = texel[2] | texel[3] << 8, pair = code >> 12, soilPair = index => Object.freeze([soilIds[PAIR_LOW[index]], soilIds[PAIR_HIGH[index]]]);
    const source = value => value === BASE_SOURCE ? 'base' : value === NO_SOURCE ? null : `override:${context.overrides[value].id}`;
    return Object.freeze({
        id: context.page.id, level: context.page.level, spacing: support.spacing, generated: true, measured: false,
        recipe: Object.freeze({ id: context.recipe.id, hash: context.inputs.recipe.hash }), seed: context.seed, key: landscapeSurfaceDetailKey(context.inputs),
        position: Object.freeze({ x, z }), warp: Object.freeze({ x: point.warpX, z: point.warpZ }), warpedPosition: Object.freeze({ x: warpedX, z: warpedZ }),
        base: Object.freeze({ label: soilIds[baseLabels[0]], other: baseLabels[1] >= 0 ? soilIds[baseLabels[1]] : null, distanceMeters: baseDistance }),
        label: soilIds[point.label], finalLabel: soilIds[point.finalLabel],
        nearest: point.other >= 0 ? Object.freeze({ soil: soilIds[point.other], distanceMeters: point.distance, source: source(point.source),
            coordinateMeters: point.pair >= 0 ? point.coordinate : null }) : null,
        sample: Object.freeze({ column: sampleColumn, row: sampleRow, x: sampleX, z: sampleZ, label: soilIds[trace.label], finalLabel: soilIds[trace.finalLabel] }),
        boundary: trace.pair < 0 ? null : Object.freeze({ pair: soilPair(trace.pair), source: source(trace.source), distanceMeters: trace.distance, signedDistanceMeters: trace.signedDistance,
            otherPairDistanceMeters: trace.second, junctionFade: trace.fade, breakupMeters: trace.breakup, profile: context.profiles[trace.pair], coordinateMeters: trace.coordinate }),
        texel: Object.freeze({ bytes: Object.freeze(texel), semanticSoil: soilIds[texel[0] & 15], displaySoil: soilIds[texel[0] >> 4], coverId: texel[1], code,
            uniform: code === UNIFORM, pair: pair === LANDSCAPE_CONTOUR_COVERAGE.invalidPair ? null : soilPair(pair) })
    });
}

/**
 * Proves on the main thread, from resident native mask pages (D1 layout, overrides applied), that a fine page's whole
 * canonical native window is one display soil with no intersecting override. Returns that soil index, or -1 whenever
 * the supplied pages and their halos cannot prove it.
 * @param {{manifest:any,descriptor:any,recipe:any,nativePage?:{descriptor:any,pixels:Uint8Array,byteOffset?:number},nativePages?:Array<{descriptor:any,pixels:Uint8Array,byteOffset?:number}>}} options
 */
export function landscapeSurfaceDetailUniformSoil({ manifest, descriptor, recipe, nativePage, nativePages }) {
    const validatedRecipe = validateLandscapeSurfaceDetailRecipe(recipe), index = createLandscapeSurfaceDetailIndex(manifest, { levels: validatedRecipe.levels });
    const validated = index.manifest, grid = validated.grid, support = index.support(descriptor, validatedRecipe), records = nativePages ?? [nativePage];
    if (!Array.isArray(records) || !records.length) fail('uniform proof needs at least one resident native mask page');
    const pages = records.map(record => {
        const chunk = validated.chunks.find(value => value.id === record?.descriptor?.id), byteOffset = record?.byteOffset ?? 0;
        if (!chunk || chunk.level !== grid.maxLevel) fail('uniform proof accepts only native mask pages of this landscape');
        const layout = landscapeCoverageMaskLayout(chunk);
        if (!(record.pixels instanceof Uint8Array) || !Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset + layout.pageBytes > record.pixels.length) fail(`native mask page ${chunk.id} is incomplete`);
        return { chunk, layout, pixels: record.pixels, byteOffset };
    });
    if (validated.soil.overrides.some(override => landscapeRegionIntersectsBounds(override.region, support.native.bounds))) return -1;
    const window = support.native.window;
    let soil = -1;
    for (let row = window.minRow; row <= window.maxRow; row++) {
        const globalRow = Math.max(0, Math.min(grid.rows - 1, row));
        for (let column = window.minColumn; column <= window.maxColumn; column++) {
            const globalColumn = Math.max(0, Math.min(grid.columns - 1, column));
            let display = -1;
            for (const page of pages) {
                const localColumn = globalColumn - page.chunk.startColumn + page.layout.halo, localRow = globalRow - page.chunk.startRow + page.layout.halo;
                if (localColumn < 0 || localRow < 0 || localColumn >= page.layout.width || localRow >= page.layout.height) continue;
                display = page.pixels[page.byteOffset + (localRow * page.layout.width + localColumn) * 4] >> 4;
                break;
            }
            if (display < 0 || soil >= 0 && display !== soil) return -1;
            soil = display;
        }
    }
    return soil;
}

/**
 * Conservative typed-array scratch for admitting one generation at a fine level, including the output page, the native
 * label/cover window, the boundary build under its crossing cap, the sample window and every native cover array.
 * @param {any} manifest @param {number} level @param {any} recipe
 */
export function landscapeSurfaceDetailScratchBytes(manifest, level, recipe) {
    const validatedRecipe = validateLandscapeSurfaceDetailRecipe(recipe), index = createLandscapeSurfaceDetailIndex(manifest, { levels: validatedRecipe.levels }), grid = index.manifest.grid;
    if (!Number.isSafeInteger(level) || level <= index.maxLevel || level > index.finestLevel) fail(`level ${level} is not a fine surface-detail level`);
    const support = index.support(`l${level}/c0/r0`, validatedRecipe), samples = grid.chunkIntervals + 1, dependency = support.native.dependencyCells, canonical = support.canonicalMeters;
    const outputSide = samples + 2 * FORMAT.storedHaloSamples, labelsSide = outputSide - FORMAT.uniformMinOffset + FORMAT.uniformMaxOffset;
    const width = Math.ceil(((labelsSide - 1) * support.spacing.x + 2 * canonical) / grid.spacingX) + 2 * dependency + 4;
    const height = Math.ceil(((labelsSide - 1) * support.spacing.z + 2 * canonical) / grid.spacingZ) + 2 * dependency + 4;
    const owners = Math.min(2 ** grid.maxLevel, Math.floor((width - 2) / grid.chunkIntervals) + 2) * Math.min(2 ** grid.maxLevel, Math.floor((height - 2) / grid.chunkIntervals) + 2);
    const edges = index.manifest.soil.overrides.reduce((sum, override) => sum + (override.region.type === 'polygon' ? override.region.points.length : 4), 0);
    const native = width * height * 2 + 4 * 2 * (width + height), sampleBytes = labelsSide * labelsSide * 3 + SAMPLER_SCRATCH_BYTES * 2 + 40 * index.manifest.soil.overrides.length + 24 * edges;
    return outputSide * outputSide * 4 + native + landscapeSurfaceBoundaryScratchBytes(width, height, validatedRecipe.boundary) + sampleBytes + owners * samples * samples;
}
