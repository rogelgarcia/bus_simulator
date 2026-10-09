// Measures every hard constraint of the coastal plan on a terrain grid and reports pass/fail with the measured numbers.
// @ts-check
// Each check is a pure measurement with a declared threshold: road grades over short (20 m) and sustained (50 m) windows at 8 m stations
// along the plan centerlines, district p05/p95 heights against the plan's "24–28 m" design bands (the high city band may be overridden
// for raised variants) and the fraction of flat urban ground, the distance from every design shoreline vertex to the nearest marching-
// squares sea-level crossing, the beach arrival and bus-stop reservation heights and slopes, the open-view corridor sightline, the
// southwest swim zone cover and seabed slope, the sea-level sample count and the planning land-cover histogram. Nothing is clamped or
// defaulted silently: a missing plan record throws, and thresholds live in CONSTRAINT_DEFAULTS so variants are judged identically.
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { assertPolygon, assertSynthesisGrid, gridColumnOf, gridRowOf, polygonSampleIndices, polylinePath, sampleBilinear, slopeDegreesRaster, summaryOfSorted, worldXOf, worldZOf } from './GridSampling.mjs';
import { DEFAULT_WORKING_LIMIT_BYTES } from './ReliefMeasures.mjs';

const DEGREES = 180 / Math.PI;

export const CONSTRAINT_DEFAULTS = Object.freeze({
    maxSustainedGradePercent: 6, maxShortGradePercent: 8, sustainedWindowMeters: 50, shortWindowMeters: 20, roadStationMeters: 8,
    districtSlopeMaxDegrees: 8, districtFlatUrbanMinimumFraction: .95, highCityDistrictId: 4, highCityTargetMeters: null, highCityBandHalfWidthMeters: 1,
    shorelineToleranceMeters: 10, shorelineSearchMeters: 60,
    pointHeightToleranceMeters: .5, pointRadiusMeters: 10, pointMaxSlopeDegrees: 10, busStopMaxHeightRangeMeters: .5,
    viewCorridorEyeHeightMeters: 1.7, viewCorridorRoadName: 'Open beach descent',
    swimZone: Object.freeze({ zMin: 184, zMax: 936, seawardMeters: 150, landwardMeters: 60, allowedLandCover: Object.freeze([0, 1]), maxSeabedSlopeDegrees: 5 }),
    planningCoverClasses: Object.freeze([5, 6, 7]), listLimit: 64
});

/** @param {string} band design band such as "24–28 m" or "2–3 m plaza" */
export function parseDesignBand(band) {
    const match = /(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)/.exec(String(band));
    if (!match) throw new Error(`[SynthesisAnalysis] Cannot parse design band "${band}"`);
    const low = Number(match[1]), high = Number(match[2]);
    if (!(high >= low)) throw new Error(`[SynthesisAnalysis] Design band "${band}" is not ascending`);
    return { low, high };
}

function roadChecks(grid, heights, roads, options) {
    const windows = [{ key: 'short', meters: options.shortWindowMeters, limit: options.maxShortGradePercent }, { key: 'sustained', meters: options.sustainedWindowMeters, limit: options.maxSustainedGradePercent }];
    const entries = roads.roads.map(road => {
        const path = polylinePath(road.centerline_xyz_m.map(point => [point[0], point[2]]), `road ${road.name}`), stations = path.stations(options.roadStationMeters), count = stations.distance.length;
        const height = new Float64Array(count);
        for (let i = 0; i < count; i++) height[i] = sampleBilinear(grid, heights, stations.x[i], stations.z[i]);
        let pointGrade = 0;
        for (let i = 1; i < count; i++) pointGrade = Math.max(pointGrade, Math.abs(height[i] - height[i - 1]) / (stations.distance[i] - stations.distance[i - 1]) * 100);
        const result = { name: road.name, type: road.type, lengthMeters: path.length, stations: count, designMaxGradePercent: road.design_max_grade_percent ?? null, sourceSampledMaxGradePercent: road.sampled_terrain_max_grade_percent ?? null,
            stationGradeMaxPercent: pointGrade, passed: true };
        for (const window of windows) {
            const grades = [];
            if (path.length < window.meters) grades.push({ from: 0, to: path.length, grade: Math.abs(height[count - 1] - height[0]) / path.length * 100 });
            else for (let i = 0; i < count && stations.distance[i] + window.meters <= path.length + 1e-9; i++) {
                const end = path.pointAt(stations.distance[i] + window.meters);
                grades.push({ from: stations.distance[i], to: stations.distance[i] + window.meters, grade: Math.abs(sampleBilinear(grid, heights, end.x, end.z) - height[i]) / window.meters * 100 });
            }
            let max = 0, at = 0;
            const violations = [];
            for (const entry of grades) {
                if (entry.grade > max) { max = entry.grade; at = entry.from; }
                if (entry.grade <= window.limit) continue;
                const last = violations[violations.length - 1];
                if (last && entry.from <= last.toMeters + 1e-9) { last.toMeters = entry.to; last.maxGradePercent = Math.max(last.maxGradePercent, entry.grade); last.stations++; }
                else violations.push({ fromMeters: entry.from, toMeters: entry.to, maxGradePercent: entry.grade, stations: 1 });
            }
            result[`${window.key}Window`] = { meters: window.meters, limitPercent: window.limit, maxGradePercent: max, atDistance: at, violations };
            if (violations.length) result.passed = false;
        }
        return result;
    });
    return { passed: entries.every(entry => entry.passed), stationMeters: options.roadStationMeters, limits: { shortWindowMeters: options.shortWindowMeters, maxShortGradePercent: options.maxShortGradePercent, sustainedWindowMeters: options.sustainedWindowMeters, maxSustainedGradePercent: options.maxSustainedGradePercent },
        maxShortGradePercent: Math.max(...entries.map(entry => entry.shortWindow.maxGradePercent)), maxSustainedGradePercent: Math.max(...entries.map(entry => entry.sustainedWindow.maxGradePercent)),
        roadsWithViolations: entries.filter(entry => !entry.passed).map(entry => entry.name), roads: entries };
}

function districtChecks(grid, heights, cover, slope, seaLevel, districts, options) {
    const entries = districts.map(district => {
        assertPolygon(district.boundary_xz_m, `district ${district.name} boundary`);
        const indices = polygonSampleIndices(grid, district.boundary_xz_m), selected = [], urban = [];
        for (const i of indices) { if (heights[i] >= seaLevel && cover[i] !== 6) { selected.push(i); if (cover[i] === 5) urban.push(i); } }
        const sorted = Float64Array.from(selected, i => heights[i]).sort(), summary = summaryOfSorted(sorted, [5, 50, 95]);
        const override = district.id === options.highCityDistrictId && options.highCityTargetMeters !== null
            ? { low: options.highCityTargetMeters - options.highCityBandHalfWidthMeters, high: options.highCityTargetMeters + options.highCityBandHalfWidthMeters, source: 'highCityTargetMeters' }
            : { ...parseDesignBand(district.typical_design_band_m), source: 'typical_design_band_m' };
        let flat = 0, flatUrban = 0, within = 0;
        for (const i of selected) { if (slope[i] < options.districtSlopeMaxDegrees) flat++; if (heights[i] >= override.low && heights[i] <= override.high) within++; }
        for (const i of urban) if (slope[i] < options.districtSlopeMaxDegrees) flatUrban++;
        const withinBand = summary.count > 0 && summary.p5 >= override.low && summary.p95 <= override.high;
        const urbanFlatFraction = urban.length ? flatUrban / urban.length : null;
        return { id: district.id, name: district.name, targetElevationMeters: district.target_elevation_m, band: override, samples: summary.count, urbanSamples: urban.length,
            heights: { p05: summary.p5, p50: summary.p50, p95: summary.p95, mean: summary.mean, min: summary.min, max: summary.max }, withinBand, fractionWithinBand: summary.count ? within / summary.count : null,
            flatFraction: summary.count ? flat / summary.count : null, urbanFlatFraction, passed: withinBand && (urbanFlatFraction === null || urbanFlatFraction >= options.districtFlatUrbanMinimumFraction) };
    });
    return { passed: entries.every(entry => entry.passed), slopeMaxDegrees: options.districtSlopeMaxDegrees, flatUrbanMinimumFraction: options.districtFlatUrbanMinimumFraction, districts: entries };
}

function shorelineCheck(grid, heights, seaLevel, shoreline, options) {
    const { columns, rows, spacingX, spacingZ } = grid, radius = Math.ceil(options.shorelineSearchMeters / Math.min(spacingX, spacingZ)), land = i => heights[i] >= seaLevel;
    const points = shoreline.points_xyz_m, deviations = new Float64Array(points.length), outside = [];
    let beyond = 0;
    for (let k = 0; k < points.length; k++) {
        const [x, , z] = points[k], c0 = Math.round(gridColumnOf(grid, x)), r0 = Math.round(gridRowOf(grid, z));
        let best = Infinity;
        for (let r = Math.max(0, r0 - radius); r <= Math.min(rows - 1, r0 + radius); r++) {
            for (let c = Math.max(0, c0 - radius); c <= Math.min(columns - 1, c0 + radius); c++) {
                const i = r * columns + c;
                if (c + 1 < columns && land(i) !== land(i + 1)) {
                    const t = (seaLevel - heights[i]) / (heights[i + 1] - heights[i]);
                    best = Math.min(best, Math.hypot(worldXOf(grid, c + t) - x, worldZOf(grid, r) - z));
                }
                if (r + 1 < rows && land(i) !== land(i + columns)) {
                    const t = (seaLevel - heights[i]) / (heights[i + columns] - heights[i]);
                    best = Math.min(best, Math.hypot(worldXOf(grid, c) - x, worldZOf(grid, r + t) - z));
                }
            }
        }
        if (best === Infinity) { beyond++; best = options.shorelineSearchMeters; }
        deviations[k] = best;
        if (best > options.shorelineToleranceMeters) outside.push({ index: k, x, z, deviationMeters: best });
    }
    const summary = summaryOfSorted(Float64Array.from(deviations).sort(), [50, 95]);
    return { passed: outside.length === 0, toleranceMeters: options.shorelineToleranceMeters, searchMeters: options.shorelineSearchMeters, vertices: points.length, maxDeviationMeters: summary.max, p95DeviationMeters: summary.p95,
        meanDeviationMeters: summary.mean, verticesOutsideTolerance: outside.length, verticesBeyondSearch: beyond, outside: outside.slice(0, options.listLimit) };
}

function samplesWithin(grid, predicate, bounds) {
    const c0 = Math.max(0, Math.floor(gridColumnOf(grid, bounds.minX))), c1 = Math.min(grid.columns - 1, Math.ceil(gridColumnOf(grid, bounds.maxX)));
    const r0 = Math.max(0, Math.floor(gridRowOf(grid, bounds.maxZ))), r1 = Math.min(grid.rows - 1, Math.ceil(gridRowOf(grid, bounds.minZ)));
    const indices = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (predicate(worldXOf(grid, c), worldZOf(grid, r))) indices.push(r * grid.columns + c);
    return indices;
}

function pointCheck(grid, heights, slope, point, options) {
    const [x, target, z] = point.xyz_m, radius = options.pointRadiusMeters, height = sampleBilinear(grid, heights, x, z);
    const indices = samplesWithin(grid, (px, pz) => Math.hypot(px - x, pz - z) <= radius, { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius });
    let maxDeviation = 0, maxSlope = 0;
    for (const i of indices) { maxDeviation = Math.max(maxDeviation, Math.abs(heights[i] - target)); maxSlope = Math.max(maxSlope, slope[i]); }
    const deviation = Math.abs(height - target);
    return { name: point.name, x, z, targetHeight: target, height, deviationMeters: deviation, radiusMeters: radius, samplesWithinRadius: indices.length, maxDeviationWithinRadius: maxDeviation, maxSlopeWithinRadius: maxSlope,
        passed: deviation <= options.pointHeightToleranceMeters && maxSlope <= options.pointMaxSlopeDegrees };
}

function busStopCheck(grid, heights, slope, point, options) {
    const [x, target, z] = point.xyz_m, [alongX, alongZ] = point.footprint_m;
    const indices = samplesWithin(grid, (px, pz) => Math.abs(px - x) <= alongX / 2 && Math.abs(pz - z) <= alongZ / 2, { minX: x - alongX / 2, maxX: x + alongX / 2, minZ: z - alongZ / 2, maxZ: z + alongZ / 2 });
    const sorted = Float64Array.from(indices, i => heights[i]).sort(), summary = summaryOfSorted(sorted, [50]);
    let maxSlope = 0;
    for (const i of indices) maxSlope = Math.max(maxSlope, slope[i]);
    const range = summary.count ? summary.max - summary.min : null;
    return { name: point.name, x, z, targetHeight: target, footprintMeters: { alongX, alongZ, orientation: 'footprint_m[0] along X, footprint_m[1] along Z' }, samples: summary.count, minHeight: summary.min, maxHeight: summary.max, meanHeight: summary.mean,
        heightRangeMeters: range, maxSlopeDegrees: maxSlope, passed: summary.count > 0 && range <= options.busStopMaxHeightRangeMeters && maxSlope <= options.pointMaxSlopeDegrees && Math.abs(summary.mean - target) <= options.pointHeightToleranceMeters };
}

// marches west (-X) from the eye: land samples raise the foreground horizon, the first sea sample whose surface angle clears it is visible sea
function westwardSeaSightline(grid, heights, seaLevel, id, x, z, eyeHeightMeters) {
    const ground = sampleBilinear(grid, heights, x, z), eye = ground + eyeHeightMeters, step = grid.spacingX;
    let horizon = -90, horizonAt = null, shore = null, visible = null, stations = 0;
    for (let k = 1; x - k * step >= grid.minX; k++) {
        const px = x - k * step, distance = k * step, height = sampleBilinear(grid, heights, px, z);
        stations++;
        if (height >= seaLevel) {
            const elevation = Math.atan((height - eye) / distance) * DEGREES;
            if (elevation > horizon) { horizon = elevation; horizonAt = { x: px, distance, height }; }
            continue;
        }
        if (!shore) shore = { x: px, distance };
        if (Math.atan((seaLevel - eye) / distance) * DEGREES > horizon) { visible = { x: px, distance }; break; }
    }
    return { id, x, z, groundHeight: ground, eyeHeight: eye, eyeHeightMeters, direction: '-X', stationsChecked: stations, shore, foregroundHorizonDegrees: horizon, foregroundHorizonAt: horizonAt, seaVisible: !!visible, firstVisibleSea: visible };
}

function viewCorridorCheck(grid, heights, seaLevel, polygon, roads, options) {
    assertPolygon(polygon, 'open view corridor');
    const indices = polygonSampleIndices(grid, polygon), sorted = Float64Array.from(indices, i => heights[i]).sort(), summary = summaryOfSorted(sorted, [50]);
    const road = roads.roads.find(entry => entry.name === options.viewCorridorRoadName);
    if (!road) throw new Error(`[SynthesisAnalysis] View corridor road ${options.viewCorridorRoadName} is not in roads.json`);
    const ends = [road.centerline_xyz_m[0], road.centerline_xyz_m[road.centerline_xyz_m.length - 1]].map(point => ({ x: point[0], z: point[2], height: sampleBilinear(grid, heights, point[0], point[2]) }));
    const upper = ends[0].height >= ends[1].height ? ends[0] : ends[1];
    let east = polygon[0];
    for (const vertex of polygon) if (vertex[0] > east[0]) east = vertex;
    const observers = [westwardSeaSightline(grid, heights, seaLevel, `road-descent-upper (${options.viewCorridorRoadName})`, upper.x, upper.z, options.viewCorridorEyeHeightMeters),
        westwardSeaSightline(grid, heights, seaLevel, 'corridor-east-vertex (informational)', east[0], east[1], options.viewCorridorEyeHeightMeters)];
    return { passed: observers[0].seaVisible, samples: summary.count, maxHeight: summary.max, meanHeight: summary.mean, criterion: 'from the upper end of the descent road, some sea surface inside the landscape is visible above the foreground horizon along -X', observers };
}

/** The southwest swim zone of the v2 generator (super-Gaussian beach zone, |v - 0.86| <= 0.094) as an offset band around the design shoreline. */
export function swimZonePolygon(shoreline, zone) {
    const inside = shoreline.points_xyz_m.filter(point => point[2] >= zone.zMin && point[2] <= zone.zMax).sort((a, b) => a[2] - b[2]);
    if (inside.length < 2) throw new Error('[SynthesisAnalysis] The design shoreline has fewer than two vertices inside the swim zone');
    return [...inside.map(point => [point[0] - zone.seawardMeters, point[2]]), ...inside.slice().reverse().map(point => [point[0] + zone.landwardMeters, point[2]])];
}

function swimZoneCheck(grid, heights, cover, slope, seaLevel, shoreline, zone) {
    const polygon = swimZonePolygon(shoreline, zone), indices = polygonSampleIndices(grid, polygon), histogram = {};
    let maxLandCover = null, landSamples = 0, waterSamples = 0, disallowed = 0;
    const seabed = [];
    for (const i of indices) {
        histogram[cover[i]] = (histogram[cover[i]] ?? 0) + 1;
        if (heights[i] >= seaLevel) { landSamples++; maxLandCover = maxLandCover === null ? cover[i] : Math.max(maxLandCover, cover[i]); if (!zone.allowedLandCover.includes(cover[i])) disallowed++; }
        else { waterSamples++; seabed.push(slope[i]); }
    }
    const summary = summaryOfSorted(Float64Array.from(seabed).sort(), [50, 95]);
    return { passed: disallowed === 0 && (summary.count === 0 || summary.p95 <= zone.maxSeabedSlopeDegrees), polygon, zone: { ...zone, allowedLandCover: [...zone.allowedLandCover] }, samples: indices.length, landSamples, waterSamples,
        coverHistogram: histogram, maxLandCoverClass: maxLandCover, disallowedLandSamples: disallowed, seabedSlopeDegrees: { min: summary.min, mean: summary.mean, p50: summary.p50, p95: summary.p95, max: summary.max } };
}

function coverCheck(cover, sourceCover, planningClasses) {
    const histogram = {};
    for (let i = 0; i < cover.length; i++) histogram[cover[i]] = (histogram[cover[i]] ?? 0) + 1;
    if (!sourceCover) return { passed: true, compared: false, histogram, planningClasses: [...planningClasses], planningMismatches: null, sourceHistogram: null };
    if (!(sourceCover instanceof Uint8Array) || sourceCover.length !== cover.length) throw new Error('[SynthesisAnalysis] sourceCover must match the cover raster length');
    const planning = new Uint8Array(256), sourceHistogram = {};
    for (const id of planningClasses) planning[id] = 1;
    let mismatches = 0;
    for (let i = 0; i < cover.length; i++) {
        sourceHistogram[sourceCover[i]] = (sourceHistogram[sourceCover[i]] ?? 0) + 1;
        if ((planning[cover[i]] || planning[sourceCover[i]]) && cover[i] !== sourceCover[i]) mismatches++;
    }
    return { passed: mismatches === 0, compared: true, histogram, sourceHistogram, planningClasses: [...planningClasses], planningMismatches: mismatches };
}

/**
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover @param {number} seaLevel
 * @param {{districts:any[],roads:{roads:any[]},shoreline:{points_xyz_m:number[][]},beachPoints:{points:any[],open_view_corridor_xz_m:number[][]}}} plan
 * @param {Partial<typeof CONSTRAINT_DEFAULTS> & {sourceCover?:Uint8Array,workingLimitBytes?:number}} [options]
 */
export function constraintReport(grid, heights, cover, seaLevel, plan, options = {}) {
    assertSynthesisGrid(grid, heights, cover);
    if (!Number.isFinite(seaLevel)) throw new Error('[SynthesisAnalysis] seaLevel must be finite');
    if (!plan || !Array.isArray(plan.districts) || !plan.roads?.roads || !Array.isArray(plan.shoreline?.points_xyz_m) || !Array.isArray(plan.beachPoints?.points)) throw new Error('[SynthesisAnalysis] constraintReport needs plan {districts, roads, shoreline, beachPoints}');
    const settings = { ...CONSTRAINT_DEFAULTS, ...options, swimZone: { ...CONSTRAINT_DEFAULTS.swimZone, ...(options.swimZone ?? {}) } };
    const arrival = plan.beachPoints.points.find(point => !point.footprint_m), busStop = plan.beachPoints.points.find(point => Array.isArray(point.footprint_m));
    if (!arrival || !busStop || !Array.isArray(plan.beachPoints.open_view_corridor_xz_m)) throw new Error('[SynthesisAnalysis] beach_points.json must hold the arrival point, the bus stop footprint and the open view corridor');
    const memory = new TerrainFieldMemory(settings.workingLimitBytes ?? DEFAULT_WORKING_LIMIT_BYTES), slope = slopeDegreesRaster(grid, heights, memory);
    let seaLevelSamples = 0, landSamples = 0;
    for (let i = 0; i < heights.length; i++) { if (heights[i] === seaLevel) seaLevelSamples++; if (heights[i] >= seaLevel) landSamples++; }
    const report = {
        roads: roadChecks(grid, heights, plan.roads, settings),
        districts: districtChecks(grid, heights, cover, slope, seaLevel, plan.districts, settings),
        shoreline: shorelineCheck(grid, heights, seaLevel, plan.shoreline, settings),
        beachArrival: pointCheck(grid, heights, slope, arrival, settings),
        busStop: busStopCheck(grid, heights, slope, busStop, settings),
        viewCorridor: viewCorridorCheck(grid, heights, seaLevel, plan.beachPoints.open_view_corridor_xz_m, plan.roads, settings),
        swimZone: swimZoneCheck(grid, heights, cover, slope, seaLevel, plan.shoreline, settings.swimZone),
        seaLevel: { passed: seaLevel === 0, seaLevel, samplesAtSeaLevel: seaLevelSamples, landSamples, waterSamples: heights.length - landSamples },
        cover: coverCheck(cover, settings.sourceCover, settings.planningCoverClasses)
    };
    memory.free('slope');
    const checks = Object.keys(report);
    return { passed: checks.every(key => report[key].passed), failedChecks: checks.filter(key => !report[key].passed), thresholds: { ...settings, sourceCover: settings.sourceCover ? 'provided' : null }, ...report };
}
