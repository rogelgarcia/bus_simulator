// Feature-sharpness measurements of the D3 resolution study: bluff face run and crest curvature, berm crest width, gully width at a contributing-area class, ridge crest radius of curvature, the landform agreement between spacings, and the fixed world windows and points every spacing is measured on.
// @ts-check
// Every measurement is defined in world units on a fixed physical window (profiles at 0.25 m stations, a 1 m slope baseline, a 2 m
// curvature chord, a quadratic fit inside a fixed radius), never in samples, so one definition applied to the 1.953125, 0.9765625 and
// 0.48828125 m results reports what the finer spacing resolves rather than what the measurement smooths away. Bilinear sampling between
// native vertices adds no detail, which is exactly why a coarse grid reports a longer bluff run, a wider berm crest and a larger crest
// radius than a fine one of the same landform. Erosion relocates a few channels between spacings, so the study also measures how far the
// results agree on their shared vertices and re-centers crest measurements on each result's own highest sample near the fixed point.
// The needle statistic the study reports per spacing lives in analysis/ReliefMeasures.mjs, shared with the fixture gate.
// All arithmetic is float64 in a fixed visitation order; nothing here is random.
import { flowAccumulation, priorityFlood, resolveFlats } from '../../terrain_fields/TerrainFieldsHydrology.mjs';
import { gridColumnOf, gridRowOf, pointInPolygon, sampleBilinear, worldXOf, worldZOf } from '../analysis/GridSampling.mjs';
import { neighborProminence, runningWindowExtreme } from '../analysis/ReliefMeasures.mjs';

const DEGREES = 180 / Math.PI;
export const PROFILE_STEP_METERS = .25;
export const SLOPE_BASELINE_METERS = 1;
export const CURVATURE_CHORD_METERS = 2;
export const RIDGE_FIT_RADIUS_METERS = 6;
/** Curvatures below this (a radius beyond 1,000 km) are float32 noise of a flat or straight surface, not a crest. */
export const CURVATURE_FLOOR_PER_METER = 1e-6;

/** A constant-Z profile sampled bilinearly at fixed stations from xStart to xEnd (+X landward on the fixture coast). @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights */
export function transectProfile(grid, heights, z, xStart, xEnd, stepMeters = PROFILE_STEP_METERS) {
    if (![z, xStart, xEnd].every(Number.isFinite) || !(xEnd > xStart) || !(stepMeters > 0)) throw new Error('[ResolutionMeasures] transectProfile needs finite z, xStart < xEnd and a positive step');
    const count = Math.round((xEnd - xStart) / stepMeters) + 1, x = new Float64Array(count), height = new Float64Array(count);
    for (let i = 0; i < count; i++) { x[i] = xStart + i * stepMeters; height[i] = sampleBilinear(grid, heights, x[i], z); }
    return { z, stepMeters, x, height };
}

/** First linear up-crossing of `level` along a profile, or null. @param {{x:Float64Array,height:Float64Array}} profile */
export function profileCrossing(profile, level) {
    const { x, height } = profile;
    for (let i = 1; i < x.length; i++) if (height[i - 1] < level && height[i] >= level) return x[i - 1] + (x[i] - x[i - 1]) * (level - height[i - 1]) / (height[i] - height[i - 1]);
    return null;
}

// chord curvature at station j: -(h(x + c) - 2 h(x) + h(x - c)) / c^2, positive where the profile is convex (a crest)
function chordCurvature(profile, j, chordStations) {
    const { height, x } = profile, a = j - chordStations, b = j + chordStations;
    if (a < 0 || b >= x.length) return null;
    const chord = x[b] - x[j];
    return -(height[b] - 2 * height[j] + height[a]) / (chord * chord);
}

const radiusOf = curvature => (curvature !== null && curvature > CURVATURE_FLOOR_PER_METER ? 1 / curvature : null);

/**
 * The bluff face of a shore-normal profile: the contiguous run of stations around the steepest station (within `searchMeters` landward of
 * the sea-level crossing) whose rising-landward slope over a 1 m baseline stays at or above `faceSlopeDegrees`; the run is its horizontal
 * length, the rise its height difference, the crest curvature the largest 2 m chord curvature within `crestWindowMeters` of its top (and
 * the toe curvature the largest concave chord curvature at its foot). `steepest` reports the steepest station and the rise over the 5 m
 * around it whatever the threshold, so a low face still yields a number. Needle stations are skipped: a one-sample spike rises and falls
 * within a few stations, so a station whose rising run loses more than `needleDropFraction` of its rise within `needleCheckMeters` past
 * its top is an artifact, not a face. A coarse grid smears the face over its sample interval, so its run grows and its crest radius
 * widens: the measurement reads the resolution of the face, not the declared operator slope.
 * @param {{x:Float64Array,height:Float64Array,stepMeters:number}} profile
 * @param {{seaLevel?:number,searchMeters?:number,faceSlopeDegrees?:number,baselineMeters?:number,crestWindowMeters?:number,chordMeters?:number,needleCheckMeters?:number,needleDropFraction?:number}} [options]
 */
export function bluffFaceMeasure(profile, { seaLevel = 0, searchMeters = 160, faceSlopeDegrees = 40, baselineMeters = SLOPE_BASELINE_METERS, crestWindowMeters = 3, chordMeters = CURVATURE_CHORD_METERS, needleCheckMeters = 3, needleDropFraction = .5 } = {}) {
    const { x, height, stepMeters } = profile, crossing = profileCrossing(profile, seaLevel);
    if (crossing === null) return { crossingX: null, steepest: null, face: null, needleStationsSkipped: 0 };
    const half = Math.max(1, Math.round(baselineMeters / 2 / stepMeters)), slope = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) { const a = Math.max(0, i - half), b = Math.min(x.length - 1, i + half); slope[i] = (height[b] - height[a]) / (x[b] - x[a]); }
    const candidates = [];
    for (let i = 0; i < x.length; i++) if (x[i] >= crossing && x[i] <= crossing + searchMeters) candidates.push(i);
    candidates.sort((a, b) => slope[b] - slope[a] || a - b);
    const needleStations = Math.max(1, Math.round(needleCheckMeters / stepMeters));
    const isNeedle = i => {
        let top = i, bottom = i;
        while (top + 1 < x.length && slope[top + 1] > 0) top++;
        while (bottom > 0 && slope[bottom - 1] > 0) bottom--;
        let lowest = height[top];
        for (let j = top + 1; j <= Math.min(x.length - 1, top + needleStations); j++) if (height[j] < lowest) lowest = height[j];
        return height[top] - lowest > needleDropFraction * (height[top] - height[bottom]);
    };
    let steepest = -1, needleStationsSkipped = 0;
    for (const i of candidates) { if (isNeedle(i)) { needleStationsSkipped++; continue; } steepest = i; break; }
    if (steepest < 0) return { crossingX: crossing, steepest: null, face: null, needleStationsSkipped };
    // a uniform face ties over its whole run (to float32 storage, so the strict maximum can sit anywhere on it): the steepest station is the middle of the run of stations at the maximum around it
    let first = steepest, last = steepest;
    const tie = slope[steepest] - 1e-4 * Math.max(1, Math.abs(slope[steepest]));
    while (first > 0 && x[first - 1] >= crossing && slope[first - 1] >= tie) first--;
    while (last + 1 < x.length && x[last + 1] <= crossing + searchMeters && slope[last + 1] >= tie) last++;
    steepest = Math.round((first + last) / 2);
    const rise = Math.max(1, Math.round(2.5 / stepMeters)), summary = { x: x[steepest], slopeDegrees: Math.atan(slope[steepest]) * DEGREES, rise5mMeters: height[Math.min(x.length - 1, steepest + rise)] - height[Math.max(0, steepest - rise)] };
    const threshold = Math.tan(faceSlopeDegrees / DEGREES);
    if (slope[steepest] < threshold) return { crossingX: crossing, steepest: summary, face: null, needleStationsSkipped };
    let toe = steepest, crest = steepest;
    while (toe > 0 && slope[toe - 1] >= threshold) toe--;
    while (crest + 1 < x.length && slope[crest + 1] >= threshold) crest++;
    const chordStations = Math.max(1, Math.round(chordMeters / stepMeters)), windowStations = Math.max(1, Math.round(crestWindowMeters / stepMeters));
    let crestCurvature = null, toeCurvature = null;
    for (let j = crest - windowStations; j <= crest + windowStations; j++) { const k = chordCurvature(profile, j, chordStations); if (k !== null && (crestCurvature === null || k > crestCurvature)) crestCurvature = k; }
    for (let j = toe - windowStations; j <= toe + windowStations; j++) { const k = chordCurvature(profile, j, chordStations); if (k !== null && (toeCurvature === null || -k > toeCurvature)) toeCurvature = -k; }
    const runMeters = x[crest] - x[toe], riseMeters = height[crest] - height[toe];
    return { crossingX: crossing, steepest: summary, needleStationsSkipped, face: { toeX: x[toe], crestX: x[crest], toeHeight: height[toe], crestHeight: height[crest], runMeters, riseMeters, meanSlopeDegrees: runMeters > 0 ? Math.atan(riseMeters / runMeters) * DEGREES : 90,
        crestCurvature, crestRadiusMeters: radiusOf(crestCurvature), toeCurvature, toeRadiusMeters: radiusOf(toeCurvature), faceSlopeThresholdDegrees: faceSlopeDegrees } };
}

/**
 * The berm of a shore-normal profile (the first local maximum within `searchMeters` landward of the crossing, as the beach transects
 * define it), its crest width (the contiguous distance around it over which the profile stays within `bandMeters` of the crest height,
 * which on an operator-built berm with a level backshore is the backshore width) and the 2 m chord curvature at the crest.
 * @param {{x:Float64Array,height:Float64Array,stepMeters:number}} profile @param {{seaLevel?:number,searchMeters?:number,bandMeters?:number,chordMeters?:number}} [options]
 */
export function bermCrestMeasure(profile, { seaLevel = 0, searchMeters = 60, bandMeters = .1, chordMeters = CURVATURE_CHORD_METERS } = {}) {
    const { x, height, stepMeters } = profile, crossing = profileCrossing(profile, seaLevel);
    if (crossing === null) return { crossingX: null, berm: null };
    let berm = -1;
    for (let i = 1; i + 1 < x.length; i++) {
        if (x[i] <= crossing || x[i] - crossing > searchMeters) continue;
        if (height[i] > height[i - 1] && height[i] >= height[i + 1] && height[i] > seaLevel) { berm = i; break; }
    }
    if (berm < 0) return { crossingX: crossing, berm: null };
    const top = height[berm];
    let from = berm, to = berm;
    while (from > 0 && Math.abs(height[from - 1] - top) <= bandMeters) from--;
    while (to + 1 < x.length && Math.abs(height[to + 1] - top) <= bandMeters) to++;
    const crestCurvature = chordCurvature(profile, berm, Math.max(1, Math.round(chordMeters / stepMeters)));
    return { crossingX: crossing, berm: { x: x[berm], height: top, distanceFromCrossing: x[berm] - crossing, crestWidthMeters: x[to] - x[from], from: x[from], to: x[to], bandMeters, crestCurvature, crestRadiusMeters: radiusOf(crestCurvature) } };
}

/**
 * Contributing area (m², Quinn multiple-flow routing on the Priority-Flood filled surface, outlets at the landscape edge and below sea
 * level): the same routing the drainage-incision measurement uses, returned as an untracked raster for the gully measurements.
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {number} seaLevel
 * @param {import('../../terrain_fields/TerrainFieldsGrid.mjs').TerrainFieldMemory} memory @param {{exponent?:number}} [options]
 */
export function contributingAreaRaster(grid, heights, seaLevel, memory, { exponent = 1.1 } = {}) {
    const { columns, rows } = grid, n = columns * rows, outlet = memory.allocate('resolution/outlet', Uint8Array, n);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        outlet[i] = row === 0 || column === 0 || row === rows - 1 || column === columns - 1 || heights[i] < seaLevel ? 1 : 0;
    }
    const flood = priorityFlood(grid, heights, outlet, memory), flats = resolveFlats(grid, flood, memory), flow = flowAccumulation(grid, flood, flats, exponent, memory);
    const area = Float64Array.from(flow.area);
    memory.free('flood/filled', 'flood/order', 'flats/flat', 'flats/mask', 'flats/processing', 'flow/area', 'resolution/outlet');
    return area;
}

/** @param {Float64Array} sorted */
function summaryOf(sorted) {
    const count = sorted.length;
    if (!count) return null;
    let sum = 0;
    for (let i = 0; i < count; i++) sum += sorted[i];
    const at = p => sorted[Math.min(count - 1, Math.max(0, Math.floor(p / 100 * (count - 1))))];
    return { count, mean: sum / count, p10: at(10), median: at(50), p90: at(90), p99: at(99), min: sorted[0], max: sorted[count - 1] };
}

/**
 * Cross-section width of the drainage lines in one contributing-area class: at every selected sample (a deterministic stride keeps at most
 * `maxSamples`) the channel direction is the downhill gradient over a 1 m baseline, the cross-section runs perpendicular to it, and the
 * width is the distance between the two points where the ground first reaches `bankMeters` above the sample's floor; samples whose banks
 * are not reached within `maxHalfWidthMeters` on both sides are counted as unbounded, flat samples as flat, and floor samples that are
 * needles (more than `maxProminenceMeters` above all neighbours: deposition lumps, not floors) are counted and skipped.
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Float64Array} area
 * @param {{include:(index:number)=>boolean,areaMinM2:number,areaMaxM2:number,bankMeters?:number,maxHalfWidthMeters?:number,stepMeters?:number,maxSamples?:number,gradientBaselineMeters?:number,maxProminenceMeters?:number}} options
 */
export function gullyWidthMeasure(grid, heights, area, { include, areaMinM2, areaMaxM2, bankMeters = 1, maxHalfWidthMeters = 40, stepMeters = PROFILE_STEP_METERS, maxSamples = 400, gradientBaselineMeters = SLOPE_BASELINE_METERS, maxProminenceMeters = 2 }) {
    if (typeof include !== 'function' || !(areaMaxM2 > areaMinM2) || !(bankMeters > 0) || !(maxHalfWidthMeters > 0) || !(stepMeters > 0) || !(maxSamples >= 1) || !(maxProminenceMeters > 0)) throw new Error('[ResolutionMeasures] gullyWidthMeasure needs include, an area class, positive bank, reach, step, sample count and prominence');
    const n = grid.columns * grid.rows, candidates = [];
    let needles = 0;
    for (let i = 0; i < n; i++) {
        if (area[i] < areaMinM2 || area[i] >= areaMaxM2 || !include(i)) continue;
        if (neighborProminence(grid, heights, i) > maxProminenceMeters) { needles++; continue; }
        candidates.push(i);
    }
    const stride = Math.max(1, Math.ceil(candidates.length / maxSamples)), widths = [], steps = Math.floor(maxHalfWidthMeters / stepMeters);
    let flat = 0, unbounded = 0, visited = 0;
    for (let k = 0; k < candidates.length; k += stride) {
        visited++;
        const i = candidates[k], column = i % grid.columns, row = (i - column) / grid.columns, x = worldXOf(grid, column), z = worldZOf(grid, row), floor = heights[i], b = gradientBaselineMeters;
        const gx = (sampleBilinear(grid, heights, x + b, z) - sampleBilinear(grid, heights, x - b, z)) / (2 * b), gz = (sampleBilinear(grid, heights, x, z + b) - sampleBilinear(grid, heights, x, z - b)) / (2 * b), length = Math.hypot(gx, gz);
        if (length < 1e-6) { flat++; continue; }
        // the channel runs down the gradient; the cross-section is the perpendicular through the sample
        const px = -gz / length, pz = gx / length, bank = floor + bankMeters;
        const reach = sign => { for (let s = 1; s <= steps; s++) { const t = s * stepMeters; if (sampleBilinear(grid, heights, x + sign * px * t, z + sign * pz * t) >= bank) return t; } return null; };
        const left = reach(1), right = reach(-1);
        if (left === null || right === null) { unbounded++; continue; }
        widths.push(left + right);
    }
    return { areaClassM2: [areaMinM2, areaMaxM2], bankMeters, candidates: candidates.length, needles, stride, visited, measured: widths.length, flat, unbounded, stepMeters, maxHalfWidthMeters, widthMeters: summaryOf(Float64Array.from(widths).sort()) };
}

// Gaussian elimination with partial pivoting of a dense n x n system (row-major A)
function solveLinear(A, y, n) {
    const a = Float64Array.from(A), b = Float64Array.from(y);
    for (let k = 0; k < n; k++) {
        let pivot = k;
        for (let i = k + 1; i < n; i++) if (Math.abs(a[i * n + k]) > Math.abs(a[pivot * n + k])) pivot = i;
        if (Math.abs(a[pivot * n + k]) < 1e-12) throw new Error('[ResolutionMeasures] the quadratic fit is singular (too few distinct samples in the radius)');
        if (pivot !== k) { for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[pivot * n + j]; a[pivot * n + j] = t; } const t = b[k]; b[k] = b[pivot]; b[pivot] = t; }
        for (let i = k + 1; i < n; i++) {
            const f = a[i * n + k] / a[k * n + k];
            if (f === 0) continue;
            for (let j = k; j < n; j++) a[i * n + j] -= f * a[k * n + j];
            b[i] -= f * b[k];
        }
    }
    const solution = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= a[i * n + j] * solution[j]; solution[i] = s / a[i * n + i]; }
    return solution;
}

/**
 * Crest curvature at a world point from the least-squares quadratic surface through the native samples inside `radiusMeters`: the
 * smaller Hessian eigenvalue is the curvature across the crest (negative on a ridge), its reciprocal the crest radius of curvature. The fit
 * is exact for a quadratic surface at any spacing (to float32 storage), so differences between spacings are resolution, not fitting noise.
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights
 */
export function ridgeCurvatureMeasure(grid, heights, x, z, radiusMeters = RIDGE_FIT_RADIUS_METERS) {
    if (![x, z, radiusMeters].every(Number.isFinite) || !(radiusMeters > 0)) throw new Error('[ResolutionMeasures] ridgeCurvatureMeasure needs a finite point and a positive radius');
    const c0 = Math.max(0, Math.ceil(gridColumnOf(grid, x - radiusMeters))), c1 = Math.min(grid.columns - 1, Math.floor(gridColumnOf(grid, x + radiusMeters)));
    const r0 = Math.max(0, Math.ceil(gridRowOf(grid, z + radiusMeters))), r1 = Math.min(grid.rows - 1, Math.floor(gridRowOf(grid, z - radiusMeters)));
    // normal equations of h = a + b dx + c dz + d dx^2 + e dx dz + f dz^2
    const A = new Float64Array(36), y = new Float64Array(6), basis = new Float64Array(6);
    let samples = 0;
    for (let row = r0; row <= r1; row++) for (let column = c0; column <= c1; column++) {
        const dx = worldXOf(grid, column) - x, dz = worldZOf(grid, row) - z;
        if (dx * dx + dz * dz > radiusMeters * radiusMeters) continue;
        basis[0] = 1; basis[1] = dx; basis[2] = dz; basis[3] = dx * dx; basis[4] = dx * dz; basis[5] = dz * dz;
        const h = heights[row * grid.columns + column];
        for (let i = 0; i < 6; i++) { y[i] += basis[i] * h; for (let j = 0; j < 6; j++) A[i * 6 + j] += basis[i] * basis[j]; }
        samples++;
    }
    if (samples < 6) throw new Error(`[ResolutionMeasures] only ${samples} samples within ${radiusMeters} m of (${x}, ${z}); the quadratic fit needs at least 6`);
    const coefficients = solveLinear(A, y, 6), hxx = 2 * coefficients[3], hxz = coefficients[4], hzz = 2 * coefficients[5];
    const mean = (hxx + hzz) / 2, half = Math.sqrt(((hxx - hzz) / 2) ** 2 + hxz * hxz), k1 = mean - half, k2 = mean + half;
    // both rows of (H - k1 I) are eigenvector candidates; the longer one is the numerically meaningful one (the other degenerates when hxz ~ 0)
    const rowA = [k1 - hzz, hxz], rowB = [hxz, k1 - hxx], [vx, vz] = Math.hypot(rowA[0], rowA[1]) >= Math.hypot(rowB[0], rowB[1]) ? rowA : rowB;
    const bearing = Math.hypot(vx, vz) > 1e-12 ? ((Math.atan2(vx, vz) * DEGREES) % 180 + 180) % 180 : null;
    return { x, z, radiusMeters, samples, height: sampleBilinear(grid, heights, x, z), fittedHeight: coefficients[0], gradient: Math.hypot(coefficients[1], coefficients[2]), k1, k2,
        crestCurvature: -k1, crestRadiusMeters: radiusOf(-k1), acrossCrestBearingDegrees: bearing };
}

/**
 * The highest native sample within `radiusMeters` of a world point: the crest a fixed ridge point re-centers on in a result whose erosion
 * moved the local summit a little (the measured distance says how much).
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights
 */
export function nearestLocalMaximum(grid, heights, x, z, radiusMeters) {
    if (![x, z, radiusMeters].every(Number.isFinite) || !(radiusMeters > 0)) throw new Error('[ResolutionMeasures] nearestLocalMaximum needs a finite point and a positive radius');
    const c0 = Math.max(0, Math.ceil(gridColumnOf(grid, x - radiusMeters))), c1 = Math.min(grid.columns - 1, Math.floor(gridColumnOf(grid, x + radiusMeters)));
    const r0 = Math.max(0, Math.ceil(gridRowOf(grid, z + radiusMeters))), r1 = Math.min(grid.rows - 1, Math.floor(gridRowOf(grid, z - radiusMeters)));
    let best = null;
    for (let row = r0; row <= r1; row++) for (let column = c0; column <= c1; column++) {
        const px = worldXOf(grid, column), pz = worldZOf(grid, row), distance = Math.hypot(px - x, pz - z);
        if (distance > radiusMeters) continue;
        const height = heights[row * grid.columns + column];
        // ties resolve to the sample nearest the requested point, then the lower index, so the choice is deterministic
        if (!best || height > best.height || (height === best.height && distance < best.distanceMeters)) best = { x: px, z: pz, height, distanceMeters: distance };
    }
    if (!best) throw new Error(`[ResolutionMeasures] no native sample within ${radiusMeters} m of (${x}, ${z})`);
    return best;
}

/** Distance from a point to the boundary of a polygon ([x, z] vertices), 0 inside it. @param {ArrayLike<ArrayLike<number>>} polygon */
export function distanceToPolygonBoundary(polygon, x, z) {
    if (pointInPolygon(polygon, x, z)) return 0;
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const ax = polygon[j][0], az = polygon[j][1], bx = polygon[i][0], bz = polygon[i][1], dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
        const t = length2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length2)) : 0;
        best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
}

/**
 * How far a finer result departs from the coarsest one on the vertices they share (the finer grid must nest the coarse one): percentiles
 * of |dh|, the fractions within 0.5 / 1 / 3 m and where the largest difference sits. The coarse grid is the reference because the fixed
 * measurement geometry was chosen on it; a large local difference marks a relocated channel, not a resolution gain.
 * @param {{grid:import('../analysis/GridSampling.mjs').SynthesisGrid,heights:Float32Array}} coarse @param {{grid:import('../analysis/GridSampling.mjs').SynthesisGrid,heights:Float32Array}} fine
 */
export function landformAgreement(coarse, fine) {
    const ratio = (fine.grid.columns - 1) / (coarse.grid.columns - 1);
    if (!Number.isInteger(ratio) || ratio < 1 || fine.grid.rows - 1 !== (coarse.grid.rows - 1) * ratio || fine.grid.minX !== coarse.grid.minX || fine.grid.maxZ !== coarse.grid.maxZ) throw new Error('[ResolutionMeasures] landformAgreement needs a fine grid that nests the coarse grid');
    const deltas = new Float64Array(coarse.grid.columns * coarse.grid.rows);
    let maximum = -1, at = null, within05 = 0, within1 = 0, within3 = 0;
    for (let row = 0; row < coarse.grid.rows; row++) for (let column = 0; column < coarse.grid.columns; column++) {
        const i = row * coarse.grid.columns + column, a = coarse.heights[i], b = fine.heights[row * ratio * fine.grid.columns + column * ratio], d = Math.abs(a - b);
        deltas[i] = d;
        if (d <= .5) within05++; if (d <= 1) within1++; if (d <= 3) within3++;
        if (d > maximum) { maximum = d; at = { x: worldXOf(coarse.grid, column), z: worldZOf(coarse.grid, row), coarseHeight: a, fineHeight: b }; }
    }
    const summary = summaryOf(deltas.sort()), n = deltas.length;
    return { ratio, sharedVertices: n, absoluteDeltaMeters: { mean: summary.mean, p50: summary.median, p90: summary.p90, p99: summary.p99, max: summary.max }, maxAt: at,
        within: { '0.5m': within05 / n, '1m': within1 / n, '3m': within3 / n } };
}

/**
 * Ridge points of a result: samples that are the highest within `localWindowMeters` (knolls and summits on the ridge crests) and no
 * needle (at most `maxProminenceMeters` above their highest neighbour), ranked by their relief over `reliefWindowMeters`, taken greedily
 * with a minimum separation. Returned in world coordinates so the same points are measured on every spacing.
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights
 * @param {{include:(index:number)=>boolean,count?:number,separationMeters?:number,localWindowMeters?:number,reliefWindowMeters?:number,maxProminenceMeters?:number}} options
 */
export function selectRidgePoints(grid, heights, { include, count = 6, separationMeters = 150, localWindowMeters = 30, reliefWindowMeters = 100, maxProminenceMeters = 2 }) {
    if (typeof include !== 'function' || !(count >= 1) || !(separationMeters >= 0) || !(localWindowMeters > 0) || !(reliefWindowMeters > 0) || !(maxProminenceMeters > 0)) throw new Error('[ResolutionMeasures] selectRidgePoints needs include and positive count, windows and prominence');
    const n = grid.columns * grid.rows, localRadius = Math.max(1, Math.round(localWindowMeters / grid.spacingX / 2)), reliefRadius = Math.max(1, Math.round(reliefWindowMeters / grid.spacingX / 2));
    const maximum = runningWindowExtreme(grid, heights, localRadius, true, new Float64Array(n)), minimum = runningWindowExtreme(grid, heights, reliefRadius, false, new Float64Array(n));
    const candidates = [];
    for (let i = 0; i < n; i++) if (heights[i] === maximum[i] && include(i) && neighborProminence(grid, heights, i) <= maxProminenceMeters) candidates.push({ index: i, relief: heights[i] - minimum[i] });
    candidates.sort((a, b) => b.relief - a.relief || a.index - b.index);
    const chosen = [];
    for (const candidate of candidates) {
        if (chosen.length >= count) break;
        const column = candidate.index % grid.columns, row = (candidate.index - column) / grid.columns, x = worldXOf(grid, column), z = worldZOf(grid, row);
        if (chosen.some(point => Math.hypot(point.x - x, point.z - z) < separationMeters)) continue;
        chosen.push({ id: `R${chosen.length + 1}`, x, z, height: heights[candidate.index], reliefMeters: candidate.relief });
    }
    return chosen;
}

/**
 * The sample in a contributing-area class with the deepest incision (running maximum of height over `ridgeWindowMeters` minus its own
 * height) at least `marginMeters` inside the grid: the center of the gully window.
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Float64Array} area
 * @param {{include:(index:number)=>boolean,areaMinM2:number,areaMaxM2:number,ridgeWindowMeters?:number,marginMeters?:number}} options
 */
export function deepestIncisionPoint(grid, heights, area, { include, areaMinM2, areaMaxM2, ridgeWindowMeters = 60, marginMeters = 80 }) {
    const n = grid.columns * grid.rows, radius = Math.max(1, Math.round(ridgeWindowMeters / grid.spacingX / 2)), ridge = runningWindowExtreme(grid, heights, radius, true, new Float64Array(n));
    const marginColumns = Math.ceil(marginMeters / grid.spacingX), marginRows = Math.ceil(marginMeters / grid.spacingZ);
    let best = -1, incision = -Infinity;
    for (let i = 0; i < n; i++) {
        if (area[i] < areaMinM2 || area[i] >= areaMaxM2 || !include(i)) continue;
        const column = i % grid.columns, row = (i - column) / grid.columns;
        if (column < marginColumns || row < marginRows || column >= grid.columns - marginColumns || row >= grid.rows - marginRows) continue;
        const depth = ridge[i] - heights[i];
        if (depth > incision) { incision = depth; best = i; }
    }
    if (best < 0) return null;
    const column = best % grid.columns, row = (best - column) / grid.columns;
    return { x: worldXOf(grid, column), z: worldZOf(grid, row), height: heights[best], incisionMeters: incision, areaM2: area[best] };
}

/**
 * The row with the tallest rise over `riseRunMeters` along its shore-normal profile (`rangeOf(z)` gives the X range to scan, null to skip
 * the row) in each of `bands` equal Z bands (north to south): the transects the bluff is measured on are placed where the coarse result's
 * coast actually has its tallest steps, whatever their slope.
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {(z:number)=>({xStart:number,xEnd:number}|null)} rangeOf
 * @param {{bands?:number,stepMeters?:number,riseRunMeters?:number}} [options]
 */
export function rowsWithTallestRise(grid, heights, rangeOf, { bands = 3, stepMeters = 1, riseRunMeters = 5 } = {}) {
    if (typeof rangeOf !== 'function' || !Number.isInteger(bands) || bands < 1 || !(stepMeters > 0) || !(riseRunMeters > 0)) throw new Error('[ResolutionMeasures] rowsWithTallestRise needs rangeOf, a positive band count, step and rise run');
    const best = new Array(bands).fill(null), k = Math.max(1, Math.round(riseRunMeters / stepMeters));
    for (let row = 0; row < grid.rows; row++) {
        const z = worldZOf(grid, row), range = rangeOf(z);
        if (!range) continue;
        const profile = transectProfile(grid, heights, z, range.xStart, range.xEnd, stepMeters), band = Math.min(bands - 1, Math.floor(row * bands / grid.rows));
        let rise = -Infinity, at = null;
        for (let i = k; i < profile.x.length; i++) { const d = profile.height[i] - profile.height[i - k]; if (d > rise) { rise = d; at = (profile.x[i] + profile.x[i - k]) / 2; } }
        if (at !== null && (!best[band] || rise > best[band].riseMeters)) best[band] = { band, row, z, x: at, riseMeters: rise, riseRunMeters };
    }
    return best.filter(Boolean);
}

/**
 * A square world window of `intervals` native intervals of `grid` centered as close as possible to (centerX, centerZ) on the grid's
 * vertices and clamped inside it; on the coarsest fixture grid the window edges are vertices of every finer fixture grid too.
 * @param {import('../analysis/GridSampling.mjs').SynthesisGrid} grid
 */
export function fixedWindow(grid, centerX, centerZ, intervals, id = 'window') {
    if (!Number.isInteger(intervals) || intervals < 2 || intervals % 2 || intervals >= grid.columns || intervals >= grid.rows || !Number.isFinite(centerX) || !Number.isFinite(centerZ)) throw new Error('[ResolutionMeasures] fixedWindow needs an even interval count inside the grid and a finite center');
    const half = intervals / 2;
    const column0 = Math.min(Math.max(0, Math.round(gridColumnOf(grid, centerX)) - half), grid.columns - 1 - intervals), row0 = Math.min(Math.max(0, Math.round(gridRowOf(grid, centerZ)) - half), grid.rows - 1 - intervals);
    return { id, minX: worldXOf(grid, column0), maxX: worldXOf(grid, column0 + intervals), minZ: worldZOf(grid, row0 + intervals), maxZ: worldZOf(grid, row0), centerX: worldXOf(grid, column0 + half), centerZ: worldZOf(grid, row0 + half),
        sizeMeters: intervals * grid.spacingX, intervals, requested: { centerX, centerZ } };
}
