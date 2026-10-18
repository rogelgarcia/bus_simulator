// Measures the AI 596 declared-target features diagnoseRelief does not: Dean fit and shelf, nearshore bar, reef, rim face and talus, west-cliff face and platform, foredunes, the face mask beyond the steepest slope.
// @ts-check
// Every function takes the plain grid object ({columns, rows, spacingX, spacingZ, minX, maxZ}) with float32 heights, runs in float64
// with a fixed visitation order and returns JSON-serializable numbers, so the targets evaluator measures a synthesized candidate exactly
// as its unit tests measure synthetic profiles. Transects are shore-normal rows of constant Z across the design shoreline (positive d
// landward, like the engine's shoreSigned); profile measures find contiguous runs of stations by their central-difference slope.
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { assertSynthesisGrid, pointInPolygon, polygonSampleIndices, profileSlopeDegrees, sampleBilinear, sampleNearest, shorelineXAt, slopeDegreesRaster, summaryOfSorted } from './GridSampling.mjs';
import { DEFAULT_WORKING_LIMIT_BYTES, naturalLandMask } from './ReliefMeasures.mjs';

const DEGREES = 180 / Math.PI;
const FOREDUNE_ZONE = 8, REEF_ZONE = 2, BAR_ZONE = 3;

/** Nearest-rank-below median of a number list, null when empty. @param {number[]} values */
export function medianOf(values) {
    const list = values.filter(value => Number.isFinite(value));
    if (!list.length) return null;
    const sorted = Float64Array.from(list).sort();
    return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * Constant-Z shore-normal transect across the design shoreline: stations every stepMeters from seawardMeters seaward to landwardMeters
 * landward of the shoreline X, with bilinear heights, nearest categorical labels of optional layers and the first up-crossing of sea level.
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {number} seaLevel @param {number[][]} shorelinePoints [x, y, z] vertices
 * @param {number} z @param {{seawardMeters:number,landwardMeters:number,stepMeters?:number,labels?:Record<string,Uint8Array>}} options
 */
export function shoreTransect(grid, heights, seaLevel, shorelinePoints, z, { seawardMeters, landwardMeters, stepMeters = 1, labels = {} }) {
    assertSynthesisGrid(grid, heights);
    if (!(seawardMeters >= 0) || !(landwardMeters >= 0) || !(stepMeters > 0)) throw new Error('[SynthesisAnalysis] shoreTransect needs non-negative extents and a positive step');
    const shorelineX = shorelineXAt(shorelinePoints, z), count = Math.floor((seawardMeters + landwardMeters) / stepMeters) + 1;
    const d = new Float64Array(count), x = new Float64Array(count), height = new Float64Array(count), labelled = Object.fromEntries(Object.keys(labels).map(name => [name, new Uint8Array(count)]));
    for (let i = 0; i < count; i++) {
        d[i] = -seawardMeters + i * stepMeters; x[i] = shorelineX + d[i];
        height[i] = sampleBilinear(grid, heights, x[i], z);
        for (const name of Object.keys(labels)) labelled[name][i] = sampleNearest(grid, labels[name], x[i], z);
    }
    const slope = profileSlopeDegrees(d, height);
    let crossing = null;
    for (let i = 1; i < count; i++) if (height[i - 1] < seaLevel && height[i] >= seaLevel) { crossing = d[i - 1] + (d[i] - d[i - 1]) * (seaLevel - height[i - 1]) / (height[i] - height[i - 1]); break; }
    return { z, shorelineX, stepMeters, seaLevel, crossing, stations: { d, x, height, slopeDegrees: slope, labels: labelled } };
}

/**
 * Least-squares Dean 1991 fit h = -A x^(2/3) of the seabed between minDepth and maxDepth below sea level, with the virtual origin searched
 * over originOffsets (meters seaward of the waterline crossing), plus the distance where maxDepth is reached and the shelf slope from there
 * to floorDepth (or the deepest station when the floor is not reached).
 * @param {ReturnType<typeof shoreTransect>} transect @param {{minDepthMeters?:number,maxDepthMeters?:number,floorDepthMeters?:number,originSearch?:{from:number,to:number,step:number}}} [options]
 */
export function deanFit(transect, { minDepthMeters = 1.2, maxDepthMeters = 8, floorDepthMeters = 30, originSearch = { from: -20, to: 40, step: .5 }, excludeZones = [REEF_ZONE, BAR_ZONE] } = {}) {
    const { d, height } = transect.stations, seaLevel = transect.seaLevel, crossing = transect.crossing, zone = transect.stations.labels?.coastalZone ?? null;
    if (crossing === null) return { fitted: false, reason: 'no sea-level crossing' };
    // reef rock and the bar are relief placed on the sandy profile: their stations are left out of the fit when the transect carries zone labels
    const s = [], depth = [];
    let excluded = 0;
    for (let i = 0; i < d.length; i++) {
        const seaward = crossing - d[i], value = seaLevel - height[i];
        if (seaward <= 0 || value < minDepthMeters || value > maxDepthMeters) continue;
        if (zone && excludeZones.includes(zone[i])) { excluded++; continue; }
        s.push(seaward); depth.push(value);
    }
    if (s.length < 5) return { fitted: false, reason: `only ${s.length} stations between ${minDepthMeters} and ${maxDepthMeters} m depth` };
    let best = null;
    for (let offset = originSearch.from; offset <= originSearch.to + 1e-9; offset += originSearch.step) {
        let numerator = 0, denominator = 0;
        for (let i = 0; i < s.length; i++) { const x = s[i] + offset; if (x <= 0) { numerator = NaN; break; } const g = Math.cbrt(x * x); numerator += depth[i] * g; denominator += g * g; }
        if (!Number.isFinite(numerator) || denominator <= 0) continue;
        const A = numerator / denominator;
        let residual = 0;
        for (let i = 0; i < s.length; i++) { const x = s[i] + offset, error = depth[i] - A * Math.cbrt(x * x); residual += error * error; }
        const rmse = Math.sqrt(residual / s.length);
        if (!best || rmse < best.rmse) best = { A, originOffsetMeters: offset, rmse };
    }
    // the first maxDepth crossing seaward of the waterline (stations run seaward -> landward, so walk landward -> seaward) and the shelf beyond it
    let reachAt = null, reachIndex = -1;
    for (let i = d.length - 1; i >= 1; i--) {
        const a = seaLevel - height[i], b = seaLevel - height[i - 1];
        if (crossing - d[i] < 0) continue;
        if (a < maxDepthMeters && b >= maxDepthMeters) { const t = (maxDepthMeters - a) / (b - a); reachAt = (crossing - d[i]) + (d[i] - d[i - 1]) * t; reachIndex = i - 1; break; }
    }
    let shelf = null;
    if (reachAt !== null) {
        let floorAt = null, deepest = maxDepthMeters, deepestAt = reachAt;
        for (let i = reachIndex; i >= 0; i--) {
            const value = seaLevel - height[i], seaward = crossing - d[i];
            if (value > deepest) { deepest = value; deepestAt = seaward; }
            if (value >= floorDepthMeters) { const next = seaLevel - height[i + 1]; const t = (floorDepthMeters - next) / (value - next); floorAt = (crossing - d[i + 1]) + (d[i + 1] - d[i]) * t; break; }
        }
        const toDepth = floorAt === null ? deepest : floorDepthMeters, toAt = floorAt === null ? deepestAt : floorAt;
        shelf = { fromDepthMeters: maxDepthMeters, fromDistanceMeters: reachAt, toDepthMeters: toDepth, toDistanceMeters: toAt, floorReached: floorAt !== null,
            slopeDegrees: toAt > reachAt ? Math.atan((toDepth - maxDepthMeters) / (toAt - reachAt)) * DEGREES : null };
    }
    return { fitted: best !== null, ...(best ?? {}), samples: s.length, excludedSamples: excluded, minDepthMeters, maxDepthMeters, depthReachDistanceMeters: reachAt, shelf };
}

/**
 * Nearshore bar on a transect: the seaward local maximum of the seabed between minDistance and maxDistance seaward of the crossing with
 * the largest prominence over the trough on its landward side (within troughSearchMeters), or null.
 * @param {ReturnType<typeof shoreTransect>} transect @param {{minDistanceMeters?:number,maxDistanceMeters?:number,minProminenceMeters?:number,troughSearchMeters?:number}} [options]
 */
export function barMeasure(transect, { minDistanceMeters = 40, maxDistanceMeters = 160, minProminenceMeters = .15, troughSearchMeters = 40 } = {}) {
    const { d, height } = transect.stations, seaLevel = transect.seaLevel, crossing = transect.crossing, zone = transect.stations.labels?.coastalZone ?? null;
    if (crossing === null) return null;
    let best = null;
    for (let i = 1; i + 1 < d.length; i++) {
        const seaward = crossing - d[i];
        if (seaward < minDistanceMeters || seaward > maxDistanceMeters || height[i] >= seaLevel) continue;
        // reef rock is not a sand bar: a reef-zoned crest is skipped when the transect carries zone labels
        if (zone && zone[i] === REEF_ZONE) continue;
        if (!(height[i] > height[i - 1] && height[i] >= height[i + 1])) continue;
        let trough = height[i];
        for (let j = i + 1; j < d.length && d[j] - d[i] <= troughSearchMeters; j++) if (height[j] < trough) trough = height[j];
        const prominence = height[i] - trough;
        if (prominence < minProminenceMeters) continue;
        if (!best || prominence > best.prominenceMeters) best = { crestDepthMeters: height[i] - seaLevel, distanceMeters: seaward, prominenceMeters: prominence };
    }
    return best;
}

// the median absolute central-difference slope over the interior of a run (the whole run when it has fewer than three stations): the
// end stations average the face with the flat beside it, the interior ones read the face itself
function runSlope(slope, run) {
    const interior = run.end - run.start >= 2 ? slope.slice(run.start + 1, run.end) : slope.slice(run.start, run.end + 1);
    return medianOf(interior.map(value => Math.abs(value)));
}

// longest contiguous run of stations whose slope satisfies `accept` inside the index range [from, to]
function longestRun(slope, from, to, accept) {
    let best = null, start = -1;
    for (let i = from; i <= to + 1; i++) {
        const inside = i <= to && accept(slope[i]);
        if (inside && start < 0) start = i;
        if (!inside && start >= 0) { if (!best || i - 1 - start > best.end - best.start) best = { start, end: i - 1 }; start = -1; }
    }
    return best;
}

/**
 * West cliff of a transect: the longest rising run at or above faceMinSlope inside the bluff band (plus a margin), its height, run and mean
 * slope, and the wave-cut platform seaward of its foot: the contiguous stations within platformHeightRange above sea level and below
 * platformMaxSlope, its width and mean height.
 * @param {ReturnType<typeof shoreTransect>} transect @param {{bandMeters?:number[],marginMeters?:number,faceMinSlopeDegrees?:number,platformHeightRange?:number[],platformMaxSlopeDegrees?:number}} [options]
 */
export function cliffPlatformMeasure(transect, { bandMeters = [55, 120], marginMeters = 20, faceMinSlopeDegrees = 40, platformHeightRange = [.3, 1.8], platformMaxSlopeDegrees = 5 } = {}) {
    const { d, height, slopeDegrees } = transect.stations, seaLevel = transect.seaLevel, crossing = transect.crossing ?? 0;
    let from = -1, to = -1;
    for (let i = 0; i < d.length; i++) { const landward = d[i] - crossing; if (from < 0 && landward >= bandMeters[0] - marginMeters) from = i; if (landward <= bandMeters[1] + marginMeters) to = i; }
    if (from < 0 || to < from) return { face: null, platform: null };
    const run = longestRun(slopeDegrees, from, to, value => value >= faceMinSlopeDegrees);
    if (!run) return { face: null, platform: null };
    // the face spans the stations before and after the run (its rounded foot and crest); its slope is the median central-difference slope of the run's interior
    const foot = Math.max(0, run.start - 1), crest = Math.min(d.length - 1, run.end + 1), heightMeters = height[crest] - height[foot], runMeters = d[crest] - d[foot];
    const face = { footMeters: d[foot] - crossing, crestMeters: d[crest] - crossing, heightMeters, runMeters, slopeDegrees: runSlope(slopeDegrees, run), meanSlopeDegrees: runMeters > 0 ? Math.atan(heightMeters / runMeters) * DEGREES : 90, footHeightMeters: height[foot] - seaLevel, crestHeightMeters: height[crest] - seaLevel };
    let platform = null, end = foot;
    while (end > 0 && !(height[end] - seaLevel >= platformHeightRange[0] && height[end] - seaLevel <= platformHeightRange[1] && Math.abs(slopeDegrees[end]) <= platformMaxSlopeDegrees) && d[foot] - d[end] <= 15) end--;
    if (height[end] - seaLevel >= platformHeightRange[0] && height[end] - seaLevel <= platformHeightRange[1] && Math.abs(slopeDegrees[end]) <= platformMaxSlopeDegrees) {
        let start = end, sum = 0, count = 0;
        while (start >= 0 && height[start] - seaLevel >= platformHeightRange[0] && height[start] - seaLevel <= platformHeightRange[1] && Math.abs(slopeDegrees[start]) <= platformMaxSlopeDegrees) { sum += height[start] - seaLevel; count++; start--; }
        platform = { fromMeters: d[start + 1] - crossing, toMeters: d[end] - crossing, widthMeters: d[end] - d[start + 1], meanHeightMeters: sum / count };
    }
    return { face, platform };
}

/**
 * Escarpment face and talus of a rim profile (edgeProfiles entry: distance, height, slopeDegrees with the descent negative): the longest
 * descending run at or beyond faceMinSlope and the talus run that follows it within [talusMinSlope, faceMinSlope).
 * @param {{distance:number[],height:number[],slopeDegrees:number[]}} profile @param {{faceMinSlopeDegrees?:number,talusMinSlopeDegrees?:number,talusMaxRunMeters?:number}} [options]
 */
export function rimFaceMeasure(profile, { faceMinSlopeDegrees = 40, talusMinSlopeDegrees = 15, talusMaxRunMeters = 200, talusUpperMeters = 12 } = {}) {
    const { distance, height, slopeDegrees } = profile, last = distance.length - 1;
    const run = longestRun(slopeDegrees, 0, last, value => value <= -faceMinSlopeDegrees);
    if (!run) return { face: null, talus: null };
    const top = Math.max(0, run.start - 1), toe = Math.min(last, run.end + 1), drop = height[top] - height[toe], faceRun = distance[toe] - distance[top];
    const face = { fromMeters: distance[top], toMeters: distance[toe], dropMeters: drop, runMeters: faceRun, slopeDegrees: runSlope(slopeDegrees, run), meanSlopeDegrees: faceRun > 0 ? Math.atan(drop / faceRun) * DEGREES : 90, crestHeightMeters: height[top], toeHeightMeters: height[toe] };
    let end = toe;
    while (end + 1 <= last && slopeDegrees[end + 1] <= -talusMinSlopeDegrees && slopeDegrees[end + 1] > -faceMinSlopeDegrees && distance[end + 1] - distance[toe] <= talusMaxRunMeters) end++;
    let talus = null;
    if (end > toe) {
        // the apron's repose slope is read on its upper talusUpperMeters (the median central-difference slope there); the whole run down to
        // where it flattens below talusMinSlope, with its mean slope, is reported beside it (thermal deposits and the rounded toe lie there)
        const upperEnd = Math.max(toe + 1, Math.min(end, toe + Math.max(1, Math.round(talusUpperMeters / (distance[toe + 1] - distance[toe])))));
        const talusDrop = height[toe] - height[end], talusRun = distance[end] - distance[toe];
        talus = { fromMeters: distance[toe], toMeters: distance[end], dropMeters: talusDrop, runMeters: talusRun, slopeDegrees: medianOf(slopeDegrees.slice(toe + 1, upperEnd + 1).map(value => Math.abs(value))), upperMeters: distance[upperEnd] - distance[toe], meanSlopeDegrees: Math.atan(talusDrop / talusRun) * DEGREES };
    }
    return { face, talus };
}

/**
 * Foredunes: the dune height on a transect (highest foredune-zoned station above its seaward foot) and the zoned samples inside the
 * open-view corridor and the districts (which must be none).
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} coastalZone @param {number} seaLevel
 * @param {{transects:ReturnType<typeof shoreTransect>[],corridorPolygon:number[][]|null,districtPolygons:number[][][]}} options
 */
export function foreduneMeasure(grid, heights, coastalZone, seaLevel, { transects, corridorPolygon, districtPolygons }) {
    if (!(coastalZone instanceof Uint8Array) || coastalZone.length !== grid.columns * grid.rows) throw new Error('[SynthesisAnalysis] foreduneMeasure needs the coastalZone layer of the measured grid');
    let zoned = 0;
    for (let i = 0; i < coastalZone.length; i++) if (coastalZone[i] === FOREDUNE_ZONE) zoned++;
    const inside = polygon => { let count = 0; for (const i of polygonSampleIndices(grid, polygon)) if (coastalZone[i] === FOREDUNE_ZONE) count++; return count; };
    const corridorSamples = corridorPolygon ? inside(corridorPolygon) : 0, districtSamples = districtPolygons.reduce((sum, polygon) => sum + inside(polygon), 0);
    const perTransect = transects.map(transect => {
        const zone = transect.stations.labels.coastalZone, { d, height } = transect.stations;
        if (!zone) throw new Error('[SynthesisAnalysis] foreduneMeasure transects need the coastalZone label');
        let first = -1, crest = -1;
        for (let i = 0; i < d.length; i++) if (zone[i] === FOREDUNE_ZONE) { if (first < 0) first = i; if (crest < 0 || height[i] > height[crest]) crest = i; }
        if (first < 0) return { z: transect.z, dune: null };
        return { z: transect.z, dune: { heightMeters: height[crest] - height[first], crestMeters: d[crest] - (transect.crossing ?? 0), footMeters: d[first] - (transect.crossing ?? 0), crestHeightMeters: height[crest] - seaLevel } };
    });
    const withDunes = perTransect.filter(entry => entry.dune);
    return { zonedSamples: zoned, corridorSamples, districtSamples, transects: perTransect, transectsWithDunes: withDunes.length, medianHeightMeters: medianOf(withDunes.map(entry => entry.dune.heightMeters)) };
}

/**
 * Reef samples (coastalZone 2) inside a sector polygon, their top depth percentiles, and the reef samples outside it and inside the swim zone.
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} coastalZone @param {number} seaLevel
 * @param {{sectorPolygon:number[][],swimZonePolygon:number[][]|null}} options
 */
export function reefMeasure(grid, heights, coastalZone, seaLevel, { sectorPolygon, swimZonePolygon }) {
    if (!(coastalZone instanceof Uint8Array) || coastalZone.length !== grid.columns * grid.rows) throw new Error('[SynthesisAnalysis] reefMeasure needs the coastalZone layer of the measured grid');
    const { columns } = grid, depths = [];
    let total = 0, outside = 0, swim = 0;
    for (let i = 0; i < coastalZone.length; i++) {
        if (coastalZone[i] !== REEF_ZONE) continue;
        total++;
        const column = i % columns, x = grid.minX + column * grid.spacingX, z = grid.maxZ - ((i - column) / columns) * grid.spacingZ;
        if (pointInPolygon(sectorPolygon, x, z)) depths.push(heights[i] - seaLevel); else outside++;
        if (swimZonePolygon && pointInPolygon(swimZonePolygon, x, z)) swim++;
    }
    const summary = summaryOfSorted(Float64Array.from(depths).sort(), [5, 50, 95]);
    return { reefSamples: total, sectorSamples: depths.length, outsideSectorSamples: outside, swimZoneSamples: swim, topDepthMeters: { p05: summary.p5, p50: summary.p50, p95: summary.p95, min: summary.min, max: summary.max } };
}

/**
 * The designed edges of the plan districts: rays along the outward normal from stations every stepMeters along each polygon edge sample
 * the surface at 1 m; the edge width is the distance from the boundary where the surface has flattened (|slope| below flatSlopeDegrees
 * over flatRunMeters), the band slope the median |slope| over the first bandMeters, the step the height change across the edge; rays that
 * enter the sea inside the band are skipped (the plaza faces the beach).
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {number} seaLevel @param {{id:number,name:string,boundary_xz_m:number[][]}[]} districts
 * @param {{stepMeters?:number,rayMeters?:number,bandMeters?:number,flatSlopeDegrees?:number,flatRunMeters?:number}} [options]
 */
export function districtEdgeMeasure(grid, heights, seaLevel, districts, { stepMeters = 10, rayMeters = 80, bandMeters = 20, flatSlopeDegrees = 5, flatRunMeters = 6 } = {}) {
    assertSynthesisGrid(grid, heights);
    return districts.map(district => {
        const polygon = district.boundary_xz_m, widths = [], bandSlopes = [], steps = [];
        let rays = 0, skipped = 0, unresolved = 0;
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i], b = polygon[(i + 1) % polygon.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.max(1, Math.round(length / stepMeters));
            let nx = (b[1] - a[1]) / length, nz = -(b[0] - a[0]) / length;
            const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
            if (pointInPolygon(polygon, mx + nx, mz + nz)) { nx = -nx; nz = -nz; }
            for (let k = 0; k < count; k++) {
                const t = k / count, x0 = a[0] + (b[0] - a[0]) * t, z0 = a[1] + (b[1] - a[1]) * t, stations = rayMeters + 1, h = new Float64Array(stations);
                let sea = false;
                for (let d = 0; d < stations; d++) { h[d] = sampleBilinear(grid, heights, x0 + nx * d, z0 + nz * d); if (d <= bandMeters && h[d] < seaLevel) sea = true; }
                if (sea) { skipped++; continue; }
                rays++;
                const slope = new Float64Array(stations);
                for (let d = 0; d < stations; d++) { const lo = Math.max(0, d - 1), hi = Math.min(stations - 1, d + 1); slope[d] = Math.abs(Math.atan((h[hi] - h[lo]) / (hi - lo)) * DEGREES); }
                bandSlopes.push(medianOf(Array.from(slope.slice(0, bandMeters + 1))));
                let width = null;
                for (let d = 0; d + flatRunMeters < stations; d++) { let flat = true; for (let e = d; e <= d + flatRunMeters; e++) if (slope[e] >= flatSlopeDegrees) { flat = false; break; } if (flat) { width = d; break; } }
                if (width === null) { unresolved++; width = rayMeters; }
                widths.push(width); steps.push(h[0] - h[width]);
            }
        }
        const sortedWidths = Float64Array.from(widths).sort();
        return { id: district.id, name: district.name, rays, skippedSeaRays: skipped, unresolvedRays: unresolved, medianBandSlopeDegrees: medianOf(bandSlopes), medianEdgeWidthMeters: medianOf(widths),
            p90EdgeWidthMeters: sortedWidths.length ? sortedWidths[Math.floor(.9 * (sortedWidths.length - 1))] : null, medianStepMeters: medianOf(steps), fillRays: steps.filter(step => step > .5).length, cutRays: steps.filter(step => step < -.5).length };
    });
}

/**
 * Natural samples at or beyond slopeDegrees and the share of them whose face mask reaches maskThreshold (the mask must cover every slope
 * the heightfield cannot hold).
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover @param {Float32Array} faceMask @param {number} seaLevel
 * @param {{slopeDegrees?:number,maskThreshold?:number,workingLimitBytes?:number}} [options]
 */
export function faceMaskBeyondSlope(grid, heights, cover, faceMask, seaLevel, { slopeDegrees = 65, maskThreshold = .5, workingLimitBytes = DEFAULT_WORKING_LIMIT_BYTES } = {}) {
    assertSynthesisGrid(grid, heights, cover);
    if (!(faceMask instanceof Float32Array) || faceMask.length !== heights.length) throw new Error('[SynthesisAnalysis] faceMaskBeyondSlope needs the faceMask layer of the measured grid');
    const memory = new TerrainFieldMemory(workingLimitBytes), slope = slopeDegreesRaster(grid, heights, memory), natural = naturalLandMask(grid, heights, cover, seaLevel);
    let beyond = 0, masked = 0, steepest = 0;
    for (let i = 0; i < slope.length; i++) {
        if (!natural[i]) continue;
        if (slope[i] > steepest) steepest = slope[i];
        if (slope[i] < slopeDegrees) continue;
        beyond++;
        if (faceMask[i] >= maskThreshold) masked++;
    }
    memory.free('slope');
    return { slopeDegrees, maskThreshold, steepestNaturalDegrees: steepest, samplesBeyond: beyond, maskedSamplesBeyond: masked, maskedFraction: beyond ? masked / beyond : null };
}
