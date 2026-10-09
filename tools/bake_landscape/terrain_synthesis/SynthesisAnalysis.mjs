// Measures relief, profiles, view angles and plan constraints of a terrain grid and composes the AI 596 relief diagnosis document.
// @ts-check
// The module is the measurement side of the terrain synthesis engine: every function takes the plain grid object that
// readTerrainFieldSource returns ({grid, heights, cover}), is deterministic (float64, fixed visitation order, no randomness) and returns
// JSON-serializable data, so the same code diagnoses the retained v2 terrain today and synthesized variants later. The standard coastal
// measurement sets (beach transects, plateau rim profiles, NW-01/08/09 observers and the A-B route) are frozen catalogs here so every
// variant is measured identically; diagnoseRelief composes them into one document and reliefDiagnosisMarkdown tabulates it.
import { polygonCentroid, shorelineXAt } from './analysis/GridSampling.mjs';
import { curvatureExtremes, drainageIncision, localRelief, slopeStatistics } from './analysis/ReliefMeasures.mjs';
import { COASTAL_ROUTE_AB, beachProfiles, edgeProfiles, routeProfile, subtendedAngles } from './analysis/ProfileMeasures.mjs';
import { constraintReport } from './analysis/ConstraintReport.mjs';

export { NATURAL_COVER_CLASSES, SLOPE_BIN_EDGES_DEGREES, naturalLandMask, runningWindowExtreme, slopeStatistics, localRelief, curvatureExtremes, drainageIncision } from './analysis/ReliefMeasures.mjs';
export { COASTAL_ROUTE_AB, beachProfiles, edgeProfiles, subtendedAngles, routeProfile } from './analysis/ProfileMeasures.mjs';
export { CONSTRAINT_DEFAULTS, constraintReport, parseDesignBand, swimZonePolygon } from './analysis/ConstraintReport.mjs';
export { sampleBilinear, sampleNearest, polygonSampleIndices, polygonCentroid, polylinePath, shorelineXAt } from './analysis/GridSampling.mjs';

export const RELIEF_DIAGNOSIS_FORMAT = 'landscape-relief-diagnosis';

/** Standard coastal transect rows: the beach arrival row, the hillside/old-town rows and the airport/industrial rows. */
export const COASTAL_DIAGNOSIS_TRANSECTS = Object.freeze([
    { id: 'T-0490', z: 490, seawardMeters: 200, landwardMeters: 800, stepMeters: 1 },
    { id: 'T-1500', z: 1500, seawardMeters: 200, landwardMeters: 800, stepMeters: 1 },
    { id: 'T-2000', z: 2000, seawardMeters: 200, landwardMeters: 800, stepMeters: 1 },
    { id: 'T-2600', z: 2600, seawardMeters: 200, landwardMeters: 800, stepMeters: 1 },
    { id: 'T-3200', z: 3200, seawardMeters: 200, landwardMeters: 800, stepMeters: 1 }
].map(Object.freeze));

/** NW-01, NW-08 and NW-09 positions and headings with the forward hemisphere as the cone (heading 0 = north, 90 = east). */
export const COASTAL_DIAGNOSIS_OBSERVERS = Object.freeze([
    { id: 'NW-01', x: 1090, z: 490, eyeHeightMeters: 1.7, headingDegrees: 340, halfAngleDegrees: 90 },
    { id: 'NW-08', x: 2600, z: 2200, eyeHeightMeters: 1.7, headingDegrees: 45, halfAngleDegrees: 90 },
    { id: 'NW-09', x: 1000, z: 1500, eyeHeightMeters: 1.5, headingDegrees: 90, halfAngleDegrees: 90 }
].map(Object.freeze));

/** High-city rim profiles from the plateau centroid: west, south-west, south and north over 700 m. */
export const COASTAL_DIAGNOSIS_RIM_DIRECTIONS = Object.freeze([
    { id: 'rim-W', dx: -1, dz: 0 }, { id: 'rim-SW', dx: -Math.SQRT1_2, dz: -Math.SQRT1_2 }, { id: 'rim-S', dx: 0, dz: -1 }, { id: 'rim-N', dx: 0, dz: 1 }
].map(Object.freeze));
export const COASTAL_DIAGNOSIS_RIM_LENGTH_METERS = 700;
export const COASTAL_HIGH_CITY_DISTRICT_ID = 4;

const seconds = started => (performance.now() - started) / 1000;

/** Standard measurement sets derived from the plan (transect extents from the design shoreline, rim profiles from the high-city centroid); explicit `overrides` replace a set. */
export function coastalDiagnosisSets(plan, overrides = {}, { highCityDistrictId = COASTAL_HIGH_CITY_DISTRICT_ID } = {}) {
    const highCity = plan.districts.find(district => district.id === highCityDistrictId);
    if (!highCity) throw new Error(`[SynthesisAnalysis] District ${highCityDistrictId} (high city) is not in districts.json`);
    const centroid = polygonCentroid(highCity.boundary_xz_m);
    return {
        transects: overrides.transects ?? COASTAL_DIAGNOSIS_TRANSECTS.map(transect => { const shoreX = shorelineXAt(plan.shoreline.points_xyz_m, transect.z); return { id: transect.id, z: transect.z, xStart: shoreX - transect.seawardMeters, xEnd: shoreX + transect.landwardMeters, stepMeters: transect.stepMeters, shorelineX: shoreX }; }),
        profiles: overrides.profiles ?? COASTAL_DIAGNOSIS_RIM_DIRECTIONS.map(direction => ({ id: direction.id, from: [centroid.x, centroid.z], to: [centroid.x + direction.dx * COASTAL_DIAGNOSIS_RIM_LENGTH_METERS, centroid.z + direction.dz * COASTAL_DIAGNOSIS_RIM_LENGTH_METERS], stepMeters: 2 })),
        observers: overrides.observers ?? COASTAL_DIAGNOSIS_OBSERVERS.map(observer => ({ ...observer })),
        targetPolygon: overrides.targetPolygon ?? highCity.boundary_xz_m.map(point => [point[0], point[1]]), plateauCentroid: centroid, route: overrides.route ?? COASTAL_ROUTE_AB.map(part => ({ ...part }))
    };
}

/**
 * Composes every measurement into one JSON document.
 * @param {import('./analysis/GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover @param {number} seaLevel
 * @param {{districts:any[],roads:any,shoreline:any,beachPoints:any}} plan
 * @param {{label?:string,landscape?:object,constraints?:object,incision?:object,curvature?:object,relief?:object,slope?:object,sets?:object,workingLimitBytes?:number,log?:(message:string)=>void}} [options]
 */
export function diagnoseRelief(grid, heights, cover, seaLevel, plan, options = {}) {
    const { label = 'terrain', landscape = null, log = () => {} } = options, sets = coastalDiagnosisSets(plan, options.sets ?? {}), timing = {}, started = performance.now();
    const limit = options.workingLimitBytes ? { workingLimitBytes: options.workingLimitBytes } : {};
    const time = (key, run) => { const mark = performance.now(); log(`[SynthesisAnalysis] ${label}: ${key}`); const value = run(); timing[key] = seconds(mark); return value; };
    let min = Infinity, max = -Infinity, landSamples = 0;
    for (let i = 0; i < heights.length; i++) { if (heights[i] < min) min = heights[i]; if (heights[i] > max) max = heights[i]; if (heights[i] >= seaLevel) landSamples++; }
    const slope = time('slope', () => slopeStatistics(grid, heights, cover, { seaLevel, ...limit, ...(options.slope ?? {}) }));
    const relief = time('relief', () => { const result = localRelief(grid, heights, cover, { seaLevel, ...(options.relief ?? {}) }); return { method: result.method, windows: result.windows.map(({ raster, ...window }) => window) }; });
    const curvature = time('curvature', () => curvatureExtremes(grid, heights, cover, { seaLevel, ...limit, ...(options.curvature ?? {}) }));
    const incision = time('incision', () => drainageIncision(grid, heights, cover, seaLevel, { ...limit, ...(options.incision ?? {}) }));
    const beach = time('beach', () => beachProfiles(grid, heights, cover, seaLevel, { transects: sets.transects }));
    const edges = time('edges', () => edgeProfiles(grid, heights, { profiles: sets.profiles }));
    const subtended = time('subtended', () => subtendedAngles(grid, heights, { observers: sets.observers, targetPolygon: sets.targetPolygon }));
    const route = time('route', () => routeProfile(grid, heights, plan.roads, { route: sets.route }));
    const constraints = time('constraints', () => constraintReport(grid, heights, cover, seaLevel, plan, { ...limit, ...(options.constraints ?? {}) }));
    timing.totalSeconds = seconds(started);
    return { format: RELIEF_DIAGNOSIS_FORMAT, schemaVersion: 1, label, landscape, grid: { columns: grid.columns, rows: grid.rows, spacingX: grid.spacingX, spacingZ: grid.spacingZ, minX: grid.minX, maxZ: grid.maxZ }, seaLevel,
        heights: { min, max, samples: heights.length, landSamples, waterSamples: heights.length - landSamples }, sets: { transects: sets.transects, profiles: sets.profiles, observers: sets.observers, plateauCentroid: sets.plateauCentroid, route: sets.route },
        slope, relief, curvature, incision, beach, edges, subtended, route, constraints, timing };
}

const f = (value, digits = 2) => (value === null || value === undefined ? 'n/a' : typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(digits) : String(value)) : String(value));
const pct = value => (value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(2)}%`);
const table = (header, rows) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
const yesNo = value => (value ? 'pass' : 'FAIL');

/** @param {ReturnType<typeof diagnoseRelief>} doc */
export function reliefDiagnosisMarkdown(doc) {
    const lines = [`# Relief diagnosis: ${doc.label}`, ''];
    if (doc.landscape) lines.push(`Landscape: ${Object.entries(doc.landscape).map(([key, value]) => `${key} = ${value}`).join(', ')}`, '');
    lines.push(`Grid ${doc.grid.columns} x ${doc.grid.rows} at ${doc.grid.spacingX} m; heights ${f(doc.heights.min)}..${f(doc.heights.max)} m; land samples ${doc.heights.landSamples} of ${doc.heights.samples}; sea level ${doc.seaLevel}.`, '');
    lines.push('## Slope distribution (degrees)', '', table(['bin', 'natural land', 'all land'], doc.slope.bins.map((bin, i) => [bin.label, `${pct(doc.slope.natural.fractions[i])} (${doc.slope.natural.counts[i]})`, `${pct(doc.slope.land.fractions[i])} (${doc.slope.land.counts[i]})`])), '');
    lines.push(table(['statistic', 'natural land', 'all land'], [
        ['samples', String(doc.slope.natural.count), String(doc.slope.land.count)], ['mean', f(doc.slope.natural.mean), f(doc.slope.land.mean)],
        ...['p50', 'p90', 'p99', 'p100'].map(key => [key, f(doc.slope.natural.percentiles[key]), f(doc.slope.land.percentiles[key])]),
        ['>= 20 deg', `${pct(doc.slope.natural.atLeast20Degrees.fraction)} (${doc.slope.natural.atLeast20Degrees.count})`, `${pct(doc.slope.land.atLeast20Degrees.fraction)} (${doc.slope.land.atLeast20Degrees.count})`],
        ['>= 30 deg', `${pct(doc.slope.natural.atLeast30Degrees.fraction)} (${doc.slope.natural.atLeast30Degrees.count})`, `${pct(doc.slope.land.atLeast30Degrees.fraction)} (${doc.slope.land.atLeast30Degrees.count})`]]), '');
    lines.push('## Local relief on natural land (m)', '', table(['window', 'mean', 'p50', 'p90', 'p99', 'max'], doc.relief.windows.map(window => [`${window.meters} m (${window.windowSamples} samples)`, f(window.natural.mean), f(window.natural.p50), f(window.natural.p90), f(window.natural.p99), f(window.natural.max)])), '');
    lines.push(`## Curvature on natural land (1/m, sigma ${doc.curvature.sigmaSamples} samples, positive = convex)`, '', table(['curvature', 'p1', 'p50', 'p99', 'min', 'max'],
        ['profile', 'plan'].map(key => [key, f(doc.curvature[key].p1, 4), f(doc.curvature[key].p50, 4), f(doc.curvature[key].p99, 4), f(doc.curvature[key].min, 4), f(doc.curvature[key].max, 4)])), '');
    const inc = doc.incision;
    lines.push('## Drainage incision', '', table(['measure', 'value'], [['channel area threshold', `${inc.channelAreaM2} m2`], ['channel samples', String(inc.channelSamples)], ['channel length', `${f(inc.channelLengthMeters, 0)} m`],
        ['distinct networks (8-connected)', String(inc.networks)], ['largest network', `${inc.largestNetworkSamples} samples`], ['incision mean / p90 / max', `${f(inc.incision.mean)} / ${f(inc.incision.p90)} / ${f(inc.incision.max)} m (ridge window ${inc.ridgeWindowMeters} m)`],
        ['filled depressions', `${inc.depressions.filledSamples} samples, max fill ${f(inc.depressions.maximumFillMeters)} m`], ['flats', `${inc.flats.flatSamples} samples in ${inc.flats.flats} flats`]]), '');
    lines.push('## Beach transects (shore-normal, +X landward)', '', table(['transect', 'Z', 'crossing X', 'sand width m', 'foreshore slope deg (0 to +1 m)', 'berm', 'rise above 3 m', 'max h / end h'],
        doc.beach.transects.map(t => [t.id, f(t.z, 0), f(t.crossingX, 1), f(t.sandWidthMeters, 1), f(t.foreshoreSlopeDegrees), t.berm ? `${f(t.berm.height)} m at +${f(t.berm.distanceFromCrossing, 0)} m` : 'none within 60 m',
            t.riseAbove3m ? `+${f(t.riseAbove3m.distanceFromCrossing, 0)} m, local ${f(t.riseAbove3m.localSlopeDegrees, 1)} deg, next 20 m ${f(t.riseAbove3m.slopeDegreesNext20m, 1)} deg` : 'never', `${f(t.maxHeight, 1)} / ${f(t.plateauHeight, 1)} m`])), '');
    lines.push('## High-city rim profiles (from the plateau centroid)', '', table(['profile', 'start h', 'end h', 'drop m', 'min h', 'steepest deg at m', 'mean slope deg'],
        doc.edges.profiles.map(p => [p.id, f(p.startHeight, 1), f(p.endHeight, 1), f(p.dropMeters, 1), f(p.minHeight, 1), `${f(p.steepest.slopeDegrees, 1)} at ${f(p.steepest.distance, 0)}`, f(p.meanSlopeDegrees)])), '');
    lines.push('## Angle the high city subtends', '', table(['observer', 'eye h', 'max elevation deg', 'rim sample', 'distance m', 'foreground horizon deg', 'above horizon deg'],
        doc.subtended.observers.map(o => [`${o.id} (${o.x}, ${o.z}) hdg ${o.headingDegrees}`, f(o.eyeHeight), f(o.maxElevationDegrees), o.at ? `(${f(o.at.x, 0)}, ${f(o.at.z, 0)}) h ${f(o.at.height, 1)}` : 'none', o.at ? f(o.at.distance, 0) : 'n/a', f(o.foregroundHorizonDegrees), f(o.aboveHorizonDegrees)])), '');
    const r = doc.route;
    lines.push('## A-B route profile', '', table(['measure', 'value'], [['length', `${f(r.lengthMeters, 0)} m`], ['start / end height', `${f(r.startHeight)} / ${f(r.endHeight)} m`], ['min / max height', `${f(r.minHeight)} / ${f(r.maxHeight)} m`],
        ['total climb / descent', `${f(r.totalClimbMeters)} / ${f(r.totalDescentMeters)} m`], ...r.windows.map(w => [`max grade over ${w.meters} m`, `${f(w.maxGradePercent)}% at ${f(w.atDistance, 0)} m`])]), '');
    const c = doc.constraints;
    lines.push(`## Plan constraints: ${yesNo(c.passed)}${c.failedChecks.length ? ` (failed: ${c.failedChecks.join(', ')})` : ''}`, '');
    lines.push(`Roads (${yesNo(c.roads.passed)}): max ${c.roads.limits.shortWindowMeters} m grade ${f(c.roads.maxShortGradePercent)}% (limit ${c.roads.limits.maxShortGradePercent}%), max ${c.roads.limits.sustainedWindowMeters} m grade ${f(c.roads.maxSustainedGradePercent)}% (limit ${c.roads.limits.maxSustainedGradePercent}%)${c.roads.roadsWithViolations.length ? `; violations on ${c.roads.roadsWithViolations.join(', ')}` : ''}.`, '');
    lines.push(table(['road', 'length m', 'station grade max %', `${c.roads.limits.shortWindowMeters} m max %`, `${c.roads.limits.sustainedWindowMeters} m max %`, 'violations', 'result'],
        c.roads.roads.map(road => [road.name, f(road.lengthMeters, 0), f(road.stationGradeMaxPercent), f(road.shortWindow.maxGradePercent), f(road.sustainedWindow.maxGradePercent),
            [...road.shortWindow.violations.map(v => `${c.roads.limits.shortWindowMeters} m ${f(v.fromMeters, 0)}-${f(v.toMeters, 0)} m ${f(v.maxGradePercent, 1)}%`), ...road.sustainedWindow.violations.map(v => `${c.roads.limits.sustainedWindowMeters} m ${f(v.fromMeters, 0)}-${f(v.toMeters, 0)} m ${f(v.maxGradePercent, 1)}%`)].join('; ') || '-', yesNo(road.passed)])), '');
    lines.push(`Districts (${yesNo(c.districts.passed)}): band = p05..p95 inside the design band; flat = slope < ${c.districts.slopeMaxDegrees} deg.`, '', table(['district', 'band m', 'p05 / p50 / p95', 'mean', 'in band', 'flat fraction', 'urban flat fraction', 'result'],
        c.districts.districts.map(d => [`${d.id} ${d.name}`, `${d.band.low}-${d.band.high}${d.band.source === 'highCityTargetMeters' ? ' (override)' : ''}`, `${f(d.heights.p05)} / ${f(d.heights.p50)} / ${f(d.heights.p95)}`, f(d.heights.mean), yesNo(d.withinBand), pct(d.flatFraction), d.urbanFlatFraction === null ? 'no urban cover' : pct(d.urbanFlatFraction), yesNo(d.passed)])), '');
    lines.push(`Shoreline (${yesNo(c.shoreline.passed)}): ${c.shoreline.vertices} design vertices, deviation max ${f(c.shoreline.maxDeviationMeters)} m, p95 ${f(c.shoreline.p95DeviationMeters)} m, mean ${f(c.shoreline.meanDeviationMeters)} m; ${c.shoreline.verticesOutsideTolerance} outside +/-${c.shoreline.toleranceMeters} m.`, '');
    const a = c.beachArrival, b = c.busStop, v = c.viewCorridor, s = c.swimZone;
    lines.push(`Beach arrival (${yesNo(a.passed)}): h(${a.x}, ${a.z}) = ${f(a.height, 3)} m (target ${a.targetHeight}), max |h - target| within ${a.radiusMeters} m ${f(a.maxDeviationWithinRadius, 3)} m, max slope ${f(a.maxSlopeWithinRadius)} deg.`, '');
    lines.push(`Bus stop (${yesNo(b.passed)}): ${b.footprintMeters.alongX} x ${b.footprintMeters.alongZ} m at (${b.x}, ${b.z}): heights ${f(b.minHeight, 3)}..${f(b.maxHeight, 3)} m (range ${f(b.heightRangeMeters, 3)} m, mean ${f(b.meanHeight, 3)}), max slope ${f(b.maxSlopeDegrees)} deg.`, '');
    lines.push(`Open-view corridor (${yesNo(v.passed)}): max height ${f(v.maxHeight)} m in the corridor; ${v.observers.map(o => `${o.id} at (${f(o.x, 0)}, ${f(o.z, 0)}) eye ${f(o.eyeHeight)} m: shore ${o.shore ? `${f(o.shore.distance, 0)} m west` : 'not reached'}, foreground horizon ${f(o.foregroundHorizonDegrees)} deg, ${o.seaVisible ? `sea visible from ${f(o.firstVisibleSea.distance, 0)} m` : 'NO SEA VISIBLE'}`).join('; ')}.`, '');
    lines.push(`SW swim zone (${yesNo(s.passed)}): ${s.samples} samples (${s.landSamples} land, ${s.waterSamples} water), max land cover class ${s.maxLandCoverClass}, disallowed land samples ${s.disallowedLandSamples}, seabed slope min/mean/p95/max ${f(s.seabedSlopeDegrees.min)}/${f(s.seabedSlopeDegrees.mean)}/${f(s.seabedSlopeDegrees.p95)}/${f(s.seabedSlopeDegrees.max)} deg.`, '');
    lines.push(`Sea level (${yesNo(c.seaLevel.passed)}): ${c.seaLevel.samplesAtSeaLevel} samples exactly at ${c.seaLevel.seaLevel} m; ${c.seaLevel.landSamples} land / ${c.seaLevel.waterSamples} water samples.`, '');
    lines.push(`Planning cover (${yesNo(c.cover.passed)}): histogram ${Object.entries(c.cover.histogram).map(([id, count]) => `${id}:${count}`).join(' ')}${c.cover.compared ? `; planning-class mismatches vs source ${c.cover.planningMismatches}` : '; no source cover supplied'}.`, '');
    lines.push('## Timing (s)', '', table(['step', 'seconds'], Object.entries(doc.timing).map(([key, value]) => [key, f(value)])), '');
    return lines.join('\n');
}
