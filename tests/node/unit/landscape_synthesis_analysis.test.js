// Verifies the terrain synthesis measurements on analytic grids: slope, relief, curvature, incision, beach, subtended angles, route, constraints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { beachProfiles, constraintReport, curvatureExtremes, drainageIncision, localRelief, routeProfile, slopeStatistics, subtendedAngles, edgeProfiles, diagnoseRelief, reliefDiagnosisMarkdown } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisAnalysis.mjs';

const DEGREES = 180 / Math.PI;
const gridOf = (columns, rows, spacing, minX = 0) => ({ columns, rows, spacingX: spacing, spacingZ: spacing, minX, maxZ: (rows - 1) * spacing });
const xOf = (grid, c) => grid.minX + c * grid.spacingX, zOf = (grid, r) => grid.maxZ - r * grid.spacingZ;
const field = (grid, f) => Float32Array.from({ length: grid.columns * grid.rows }, (_, i) => f(xOf(grid, i % grid.columns), zOf(grid, Math.floor(i / grid.columns))));
const coverOf = (grid, f) => Uint8Array.from({ length: grid.columns * grid.rows }, (_, i) => f(xOf(grid, i % grid.columns), zOf(grid, Math.floor(i / grid.columns))));
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test('Synthesis analysis: slope histogram of a 10% plane lands entirely in the 5-10 degree bin with the analytic percentiles', () => {
    const grid = gridOf(41, 31, 2), heights = field(grid, x => .1 * x), cover = coverOf(grid, () => 2), stats = slopeStatistics(grid, heights, cover);
    const expected = Math.atan(.1) * DEGREES;
    assert.equal(stats.natural.count, 41 * 31);
    assert.deepEqual(stats.natural.counts, [0, 0, 41 * 31, 0, 0, 0, 0, 0]);
    near(stats.natural.percentiles.p50, expected, 1e-4, 'p50'); near(stats.natural.percentiles.p100, expected, 1e-4, 'p100'); near(stats.land.mean, expected, 1e-4, 'mean');
    assert.equal(stats.natural.atLeast20Degrees.count, 0);
    const rocky = slopeStatistics(grid, heights, coverOf(grid, x => (x < 40 ? 5 : 4)), { classes: [4] });
    assert.equal(rocky.natural.count, 21 * 31); assert.equal(rocky.land.count, 41 * 31);
});

test('Synthesis analysis: local relief of a 10 m step is 10 m exactly within the window radius and 0 elsewhere', () => {
    const grid = gridOf(61, 21, 2), heights = field(grid, x => (x < 60 ? 0 : 10)), cover = coverOf(grid, () => 2);
    const { windows: [window] } = localRelief(grid, heights, cover, { windowsMeters: [20] });
    assert.equal(window.radiusSamples, 5); assert.equal(window.windowSamples, 11);
    assert.equal(window.natural.max, 10);
    let elevated = 0;
    for (let i = 0; i < window.raster.length; i++) { assert.ok(window.raster[i] === 0 || window.raster[i] === 10); if (window.raster[i] === 10) elevated++; }
    assert.equal(elevated, 21 * 10, 'samples within five columns on each side of the step');
    assert.equal(window.raster[10 * 61 + 2], 0); assert.equal(window.raster[10 * 61 + 29], 10); assert.equal(window.raster[10 * 61 + 30], 10); assert.equal(window.raster[10 * 61 + 35], 0);
});

test('Synthesis analysis: curvature is positive on a ridge, negative in a valley, and plan curvature follows contour bending', () => {
    const grid = gridOf(41, 41, 1), cover = coverOf(grid, () => 3), k = .01, base = 50;
    const ridge = curvatureExtremes(grid, field(grid, x => base - k * (x - 20) ** 2), cover, { sigmaSamples: 0 });
    near(ridge.profile.p50, 2 * k, 1e-5, 'ridge profile'); near(ridge.plan.p50, 0, 1e-5, 'ridge plan'); assert.ok(ridge.profile.min >= -1e-5 && ridge.profile.max <= 2 * k + 1e-5);
    const valley = curvatureExtremes(grid, field(grid, x => base + k * (x - 20) ** 2), cover, { sigmaSamples: 0 });
    near(valley.profile.p50, -2 * k, 1e-5, 'valley profile'); assert.ok(valley.profile.max <= 1e-5);
    const dome = curvatureExtremes(grid, field(grid, (x, z) => base - k * ((x - 20) ** 2 + (z - 20) ** 2)), cover, { sigmaSamples: 0 });
    near(dome.plan.p50, 2 * k, 1e-5, 'dome plan'); near(dome.profile.p50, 2 * k, 1e-5, 'dome profile');
    const bowl = curvatureExtremes(grid, field(grid, (x, z) => base + k * ((x - 20) ** 2 + (z - 20) ** 2)), cover, { sigmaSamples: 0 });
    assert.ok(bowl.plan.p50 < 0 && bowl.profile.p50 < 0);
    const smoothed = curvatureExtremes(grid, field(grid, x => base - k * (x - 20) ** 2), cover, { sigmaSamples: 2 });
    near(smoothed.profile.p50, 2 * k, 1e-5, 'smoothing keeps the quadratic curvature in the interior');
});

test('Synthesis analysis: a V valley draining south yields one channel network with measurable incision', () => {
    const grid = gridOf(41, 61, 2), heights = field(grid, (x, z) => Math.abs(x - 40) * .2 + z * .1), cover = coverOf(grid, () => 2);
    const result = drainageIncision(grid, heights, cover, -1, { channelAreaM2: 1500, ridgeWindowMeters: 40 });
    assert.equal(result.networks, 1); assert.ok(result.channelSamples > 10 && result.channelSamples < 61 * 5, `channel samples ${result.channelSamples}`);
    assert.ok(result.incision.mean > 1 && result.incision.max <= 6 + 1e-5, `incision ${JSON.stringify(result.incision)}`);
    assert.equal(result.depressions.filledSamples, 0); assert.equal(result.channelLengthMeters, result.channelSamples * 2);
    const flat = drainageIncision(grid, field(grid, () => 5), cover, 0, { channelAreaM2: 1500 });
    assert.ok(flat.flats.flatSamples > 0);
});

test('Synthesis analysis: beach profile finds the crossing, foreshore slope, sand width, berm and the 3 m rise on an analytic beach', () => {
    const grid = gridOf(401, 5, 1);
    const profile = x => (x <= 130 ? .05 * (x - 100) : x <= 140 ? 1.5 - .03 * (x - 130) : 1.2 + .08 * (x - 140));
    const heights = field(grid, profile), cover = coverOf(grid, x => (x <= 100 ? 0 : x < 160 ? 1 : 2));
    const { transects: [t] } = beachProfiles(grid, heights, cover, 0, { transects: [{ id: 'T', z: 2, xStart: 20, xEnd: 300, stepMeters: 1 }] });
    near(t.crossingX, 100, 1e-9, 'crossing'); near(t.foreshoreSlopeDegrees, Math.atan(1 / 20) * DEGREES, 1e-9, 'foreshore'); near(t.sandWidthMeters, 59.5, 1e-9, 'sand width');
    assert.ok(t.berm && t.berm.x === 130 && Math.abs(t.berm.height - 1.5) < 1e-6, JSON.stringify(t.berm));
    near(t.riseAbove3m.x, 162.5, 1e-5, '3 m rise'); near(t.riseAbove3m.slopeDegreesNext20m, Math.atan(.08) * DEGREES, 1e-5, 'rise slope');
    near(t.plateauHeight, profile(300), 1e-6, 'plateau'); assert.equal(t.stations.x.length, 281);
    const none = beachProfiles(grid, field(grid, () => 5), cover, 0, { transects: [{ id: 'dry', z: 2, xStart: 20, xEnd: 300 }] });
    assert.equal(none.transects[0].crossingX, null); assert.equal(none.transects[0].berm, null);
});

test('Synthesis analysis: the angle a plateau subtends from a flat plain is atan(h / d) above a negative foreground horizon', () => {
    const grid = gridOf(501, 501, 2), heights = field(grid, (x, z) => (x >= 599 && x <= 801 && z >= 399 && z <= 601 ? 30 : 0));
    const polygon = [[600, 400], [800, 400], [800, 600], [600, 600]];
    const { observers: [o] } = subtendedAngles(grid, heights, { observers: [{ id: 'obs', x: 100, z: 500, eyeHeightMeters: 1.7, headingDegrees: 90, halfAngleDegrees: 90 }], targetPolygon: polygon });
    near(o.maxElevationDegrees, Math.atan((30 - 1.7) / 500) * DEGREES, 1e-9, 'elevation'); near(o.at.distance, 500, 1e-9, 'distance'); assert.equal(o.at.height, 30);
    assert.ok(o.foregroundHorizonDegrees < 0 && o.aboveHorizonDegrees > o.maxElevationDegrees);
    const { observers: [behind] } = subtendedAngles(grid, heights, { observers: [{ id: 'west-facing', x: 100, z: 500, eyeHeightMeters: 1.7, headingDegrees: 270, halfAngleDegrees: 45 }], targetPolygon: polygon });
    assert.equal(behind.rimSamplesInCone, 0); assert.equal(behind.maxElevationDegrees, null);
    const { profiles: [edge] } = edgeProfiles(grid, heights, { profiles: [{ id: 'edge', from: [700, 500], to: [500, 500], stepMeters: 2 }] });
    assert.equal(edge.startHeight, 30); assert.equal(edge.endHeight, 0); assert.equal(edge.dropMeters, 30); assert.ok(edge.steepest.slopeDegrees < -60);
});

test('Synthesis analysis: the route profile concatenates roads in order, resamples at 2 m and measures climb and window grades', () => {
    const grid = gridOf(101, 101, 2), heights = field(grid, x => .02 * x);
    const roads = { roads: [{ name: 'A', centerline_xyz_m: [[0, 0, 100], [50, 1, 100], [100, 2, 100]] }, { name: 'B', centerline_xyz_m: [[100, 2, 0], [100, 2, 100]] }] };
    const route = routeProfile(grid, heights, roads, { route: [{ name: 'A', reverse: false }, { name: 'B', reverse: true }] });
    near(route.lengthMeters, 200, 1e-9, 'length'); near(route.totalClimbMeters, 2, 1e-9, 'climb'); near(route.totalDescentMeters, 0, 1e-9, 'descent');
    assert.equal(route.stations.distance.length, 101); near(route.windows[0].maxGradePercent, 2, 1e-5, '20 m grade'); assert.deepEqual(route.parts.map(part => part.startDistance), [0, 100]);
    assert.throws(() => routeProfile(grid, heights, roads, { route: [{ name: 'missing', reverse: false }] }), /not in roads.json/);
});

function coastalFixture({ rampGrade = .05, shorelineX = 200, band = '12–13 m', wallAt = null } = {}) {
    const grid = gridOf(129, 129, 8);
    const profile = x => (x <= 252 ? .05 * (x - 200) : x <= 400 ? 2.6 : x <= 600 ? 2.6 + (x - 400) * rampGrade : 2.6 + 200 * rampGrade);
    const heights = field(grid, x => (wallAt !== null && x === wallAt ? 9 : profile(x)));
    const cover = coverOf(grid, (x, z) => (x <= 200 ? 0 : x <= 330 ? 1 : x <= 600 ? 2 : Math.abs(z - 500) <= 4 ? 6 : 5));
    const shoreline = { coordinate_order: 'X east, Y sea level, Z north; metres', points_xyz_m: Array.from({ length: 129 }, (_, i) => [shorelineX, 0, i * 8]) };
    const plateau = 2.6 + 200 * rampGrade, roads = { coordinate_order: 'X east, Y elevation, Z north; metres', roads: [
        { name: 'Ramp', from: 'P', to: 'D', width_m: 7, type: 'collector', length_m: 400, design_max_grade_percent: rampGrade * 100, centerline_xyz_m: [[300, 2.6, 500], [400, 2.6, 500], [600, plateau, 500], [700, plateau, 500]] },
        { name: 'Open beach descent', from: 'U', to: 'B', width_m: 7, type: 'collector', length_m: 120, design_max_grade_percent: 0, centerline_xyz_m: [[420, profile(420), 300], [300, 2.6, 300]] }] };
    const districts = [{ id: 4, name: 'Plateau', target_elevation_m: plateau, typical_design_band_m: band, actual_terrain_p05_p95_m: [plateau, plateau], boundary_xz_m: [[620, 100], [1000, 100], [1000, 900], [620, 900]] }];
    const beachPoints = { coordinate_order: 'X east, Y elevation, Z north; metres', points: [{ name: 'Bus stop reservation', xyz_m: [350, 2.6, 520], footprint_m: [30, 6] }, { name: 'Level beach arrival', xyz_m: [300, 2.6, 500] }],
        open_view_corridor_xz_m: [[260, 250], [400, 250], [400, 350], [260, 350]] };
    return { grid, heights, cover, plan: { districts, roads, shoreline, beachPoints }, swimZone: { zMin: 100, zMax: 400, seawardMeters: 100, landwardMeters: 40 } };
}

test('Synthesis analysis: the constraint report passes a compliant synthetic coast and fails violated grades, shoreline, band, corridor and cover', () => {
    const good = coastalFixture(), report = constraintReport(good.grid, good.heights, good.cover, 0, good.plan, { swimZone: good.swimZone, sourceCover: good.cover });
    assert.ok(report.passed, JSON.stringify(report.failedChecks));
    near(report.roads.maxSustainedGradePercent, 5, 1e-4, 'sustained grade'); assert.equal(report.roads.roads[0].sustainedWindow.violations.length, 0);
    near(report.shoreline.maxDeviationMeters, 0, 1e-9, 'shoreline'); assert.equal(report.districts.districts[0].withinBand, true); assert.equal(report.districts.districts[0].urbanFlatFraction, 1);
    near(report.beachArrival.height, 2.6, 1e-6, 'arrival height'); assert.equal(report.busStop.heightRangeMeters, 0); assert.ok(report.viewCorridor.observers[0].seaVisible);
    assert.equal(report.swimZone.maxLandCoverClass, 1); assert.equal(report.cover.planningMismatches, 0); assert.equal(report.seaLevel.passed, true);
    const steep = coastalFixture({ rampGrade: .1 }), steepReport = constraintReport(steep.grid, steep.heights, steep.cover, 0, steep.plan, { swimZone: steep.swimZone, highCityTargetMeters: 22.6 });
    assert.ok(!steepReport.roads.passed && steepReport.roads.roadsWithViolations.includes('Ramp')); near(steepReport.roads.maxShortGradePercent, 10, 1e-4, 'short grade');
    assert.ok(steepReport.roads.roads[0].sustainedWindow.violations[0].fromMeters < 110 && steepReport.roads.roads[0].sustainedWindow.violations[0].toMeters > 290);
    assert.equal(steepReport.districts.districts[0].band.source, 'highCityTargetMeters'); assert.ok(steepReport.districts.passed);
    const shifted = coastalFixture({ shorelineX: 215 }), shiftedReport = constraintReport(shifted.grid, shifted.heights, shifted.cover, 0, shifted.plan, { swimZone: shifted.swimZone });
    assert.ok(!shiftedReport.shoreline.passed); near(shiftedReport.shoreline.maxDeviationMeters, 15, 1e-9, 'shifted shoreline'); assert.equal(shiftedReport.shoreline.verticesOutsideTolerance, 129);
    const band = coastalFixture({ band: '14–15 m' }), bandReport = constraintReport(band.grid, band.heights, band.cover, 0, band.plan, { swimZone: band.swimZone });
    assert.ok(!bandReport.districts.passed && bandReport.failedChecks.includes('districts'));
    const walled = coastalFixture({ wallAt: 360 }), walledReport = constraintReport(walled.grid, walled.heights, walled.cover, 0, walled.plan, { swimZone: walled.swimZone });
    assert.ok(!walledReport.viewCorridor.passed && !walledReport.viewCorridor.observers[0].seaVisible);
    const altered = Uint8Array.from(good.cover); altered[64 * 129 + 100] = 2;
    const coverReport = constraintReport(good.grid, good.heights, altered, 0, good.plan, { swimZone: good.swimZone, sourceCover: good.cover });
    assert.equal(coverReport.cover.planningMismatches, 1); assert.ok(!coverReport.cover.passed);
    assert.throws(() => constraintReport(good.grid, good.heights, good.cover, 0, { districts: [] }), /needs plan/);
});

test('Synthesis analysis: diagnoseRelief composes a JSON document and renders markdown for a synthetic coast', () => {
    const fixture = coastalFixture();
    const plan = { ...fixture.plan, districts: [{ ...fixture.plan.districts[0], id: 4, name: 'High city' }] };
    const roads = { ...plan.roads, roads: [...plan.roads.roads, ...['Beach approach upper', 'Coastal residential road', 'Homes north access', 'Cross-town west', 'Cross-town east', 'High-city south ascent']
        .map((name, i) => ({ name, width_m: 6, type: 'local', centerline_xyz_m: [[300 + i * 50, 0, 500], [350 + i * 50, 0, 500]] }))] };
    const doc = diagnoseRelief(fixture.grid, fixture.heights, fixture.cover, 0, { ...plan, roads }, { label: 'fixture', constraints: { swimZone: fixture.swimZone },
        sets: { transects: [{ id: 'T', z: 500, xStart: 100, xEnd: 700, stepMeters: 2 }] } });
    assert.equal(doc.format, 'landscape-relief-diagnosis'); assert.equal(doc.beach.transects[0].id, 'T'); assert.equal(doc.subtended.observers.length, 3); assert.equal(doc.edges.profiles.length, 4);
    assert.ok(JSON.stringify(doc).length > 1000);
    const markdown = reliefDiagnosisMarkdown(doc);
    assert.ok(markdown.includes('## Slope distribution') && markdown.includes('## Plan constraints') && markdown.includes('Ramp'));
});
