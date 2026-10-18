// Verifies the AI 596 D4 target measurements and the declared-targets evaluator on synthetic profiles, plus the coastal-beach shelf and replace extension.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { beachProfile } from '../../../tools/bake_landscape/terrain_synthesis/operators/Coastal.mjs';
import { sampleHeight } from '../../../tools/bake_landscape/terrain_synthesis/operators/Landforms.mjs';
import { drainageIncision } from '../../../tools/bake_landscape/terrain_synthesis/analysis/ReliefMeasures.mjs';
import { barMeasure, cliffPlatformMeasure, deanFit, districtEdgeMeasure, faceMaskBeyondSlope, foreduneMeasure, medianOf, reefMeasure, rimFaceMeasure, shoreTransect } from '../../../tools/bake_landscape/terrain_synthesis/analysis/TargetMeasures.mjs';
import { polygonSampleIndices } from '../../../tools/bake_landscape/terrain_synthesis/analysis/GridSampling.mjs';
import { COASTAL_V3_TARGETS, bluffSectorPolygon, coastalV3TargetsMarkdown, evaluateCoastalV3, measureCoastalV3, recipeDistrictProfiles } from '../../../tools/bake_landscape/terrain_synthesis/analysis/TargetsReport.mjs';

const DEGREES = Math.PI / 180;
const hump = r => Math.abs(r) < 1 ? .5 * (1 + Math.cos(Math.PI * r)) : 0;
const BEACH = { deanA: .12, foreshoreSlopeRatio: 20, swashDepthMeters: 1, bermHeightMeters: 1.8, bermDistanceMeters: 30, bermFaceRunMeters: 6, bermWidthMeters: 12, backshoreSlopeDegrees: 1, deanDepthMeters: 8, shelfSlopeDegrees: 2, shelfFloorDepthMeters: 30 };
const SHORE_X = 1100, CLIFF_FOOT = 110, CLIFF_RISE = 13.7, CLIFF_RUN = 5;
// a synthetic coast in landward distance d: the engine's beach profile with a bar at 100 m, a +0.8 m platform 80..110 m, a 70 degree cliff and a terrace
const profile = beachProfile(BEACH, 0);
const coastHeight = d => {
    if (d <= 80) return profile.heightAt(d) + (d < 0 ? .4 * hump((-d - 100) / 30) - .3 * hump((-d - 70) / 20) : 0);
    if (d <= CLIFF_FOOT) return .8;
    if (d <= CLIFF_FOOT + CLIFF_RUN) return .8 + CLIFF_RISE * (d - CLIFF_FOOT) / CLIFF_RUN;
    return .8 + CLIFF_RISE + (d - CLIFF_FOOT - CLIFF_RUN) * Math.tan(2 * DEGREES);
};
function coastGrid() {
    const grid = { columns: 1301, rows: 9, spacingX: 1, spacingZ: 1, minX: 0, maxZ: 8 }, n = grid.columns * grid.rows, heights = new Float32Array(n), cover = new Uint8Array(n), coastalZone = new Uint8Array(n), faceMask = new Float32Array(n);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 1301; c++) {
        const i = r * 1301 + c, d = c - SHORE_X, h = coastHeight(d);
        heights[i] = h; cover[i] = h < 0 ? 0 : d < 50 ? 1 : d < 80 ? 2 : d <= CLIFF_FOOT + CLIFF_RUN ? 4 : 3;
        // reef rock between 150 m and the -4 m contour (the bar at 90..100 m stays a sand crest); only rows 1..7, since the sector polygon excludes the grid edge rows
        if (h < 0 && h >= -4 && h <= -1 && d <= -150 && r >= 1 && r <= 7) coastalZone[i] = 2;
        if (d >= 50 && d <= 70) { coastalZone[i] = 8; heights[i] += 4 * hump((d - 60) / 12); }
        if (d > CLIFF_FOOT && d <= CLIFF_FOOT + CLIFF_RUN) faceMask[i] = 1;
    }
    return { grid, heights, cover, coastalZone, faceMask };
}
const shoreline = { points_xyz_m: [[SHORE_X, 0, 8], [SHORE_X, 0, 4], [SHORE_X, 0, 0]] };

test('Target measures: Dean fit, shelf, bar, cliff and platform are recovered from a synthetic beach profile', () => {
    const { grid, heights, coastalZone } = coastGrid(), transect = shoreTransect(grid, heights, 0, shoreline.points_xyz_m, 4, { seawardMeters: 1099, landwardMeters: 180, labels: { coastalZone } });
    assert.ok(Math.abs(transect.crossing) < .01, `the waterline crossing lies on the design shoreline (${transect.crossing})`);
    const dean = deanFit(transect, { maxDepthMeters: 8, floorDepthMeters: 30 });
    assert.ok(dean.fitted && Math.abs(dean.A - .12) < .005, `Dean A ${dean.A} (rmse ${dean.rmse})`);
    assert.ok(Math.abs(dean.originOffsetMeters + profile.x0) <= 2.5, `virtual origin ${dean.originOffsetMeters} vs ${-profile.x0} (a nuisance parameter the bar perturbs)`);
    assert.ok(Math.abs(dean.depthReachDistanceMeters + profile.deanDepthDistance) < 2, `-8 m reached at ${dean.depthReachDistanceMeters} vs ${-profile.deanDepthDistance}`);
    assert.ok(dean.shelf && !dean.shelf.floorReached && Math.abs(dean.shelf.slopeDegrees - 2) < .1, JSON.stringify(dean.shelf));
    const bar = barMeasure(transect);
    // the hump sits on the descending Dean curve, so the local maximum lies a few meters landward of the hump centre
    assert.ok(bar && bar.distanceMeters >= 85 && bar.distanceMeters <= 100 && bar.prominenceMeters > .2 && bar.crestDepthMeters < -2 && bar.crestDepthMeters > -3, JSON.stringify(bar));
    const cliff = cliffPlatformMeasure(transect, { bandMeters: [55, 120] });
    assert.ok(cliff.face && Math.abs(cliff.face.heightMeters - CLIFF_RISE) < .6 && Math.abs(cliff.face.slopeDegrees - 70) < 4 && Math.abs(cliff.face.footMeters - CLIFF_FOOT) <= 1.5, JSON.stringify(cliff.face));
    assert.ok(cliff.platform && Math.abs(cliff.platform.widthMeters - 30) <= 3 && Math.abs(cliff.platform.meanHeightMeters - .8) < .05, JSON.stringify(cliff.platform));
    // a transect without the cliff reports no face, a seaward-only transect no crossing and no fit
    const flat = shoreTransect(grid, heights, 0, shoreline.points_xyz_m, 4, { seawardMeters: 50, landwardMeters: 60 });
    assert.deepEqual(cliffPlatformMeasure(flat), { face: null, platform: null });
    const short = deanFit(shoreTransect(grid, heights, 0, shoreline.points_xyz_m, 4, { seawardMeters: 12, landwardMeters: 2 }));
    assert.ok(short.fitted === false && /stations between/.test(short.reason), JSON.stringify(short));
    // the beach profile hands over to the shelf continuously and flattens at the floor
    const handover = profile.deanDepthDistance, step = profile.heightAt(handover - .01) - profile.heightAt(handover + .01);
    assert.ok(Math.abs(profile.heightAt(handover) + 8) < 1e-6 && Math.abs(step) < .01, `continuous handover at ${handover}: ${profile.heightAt(handover)}`);
    assert.ok(Math.abs(profile.heightAt(profile.floorDistance) + 30) < 1e-6 && profile.heightAt(profile.floorDistance - 500) === -30);
});

test('Target measures: rim face and talus, foredunes, reef, the face mask beyond the steepest slope and the drainage lines', () => {
    // rim profile: 80 m plateau for 300 m, a 25 m face at 60 degrees, a 33 degree talus over 60 m, then flat
    const distance = [], height = [];
    for (let s = 0; s <= 600; s += 2) { distance.push(s); height.push(s <= 300 ? 80 : s <= 300 + 25 / Math.tan(60 * DEGREES) ? 80 - (s - 300) * Math.tan(60 * DEGREES) : s <= 300 + 25 / Math.tan(60 * DEGREES) + 60 ? 55 - (s - 300 - 25 / Math.tan(60 * DEGREES)) * Math.tan(33 * DEGREES) : 55 - 60 * Math.tan(33 * DEGREES)); }
    const slope = distance.map((s, i) => { const a = Math.max(0, i - 1), b = Math.min(distance.length - 1, i + 1); return Math.atan((height[b] - height[a]) / (distance[b] - distance[a])) / DEGREES; });
    const rim = rimFaceMeasure({ distance, height, slopeDegrees: slope });
    assert.ok(rim.face && Math.abs(rim.face.dropMeters - 25) < 2.5 && Math.abs(rim.face.slopeDegrees - 60) < 5, JSON.stringify(rim.face));
    assert.ok(rim.talus && Math.abs(rim.talus.slopeDegrees - 33) < 2, JSON.stringify(rim.talus));
    assert.deepEqual(rimFaceMeasure({ distance, height: distance.map(() => 80), slopeDegrees: distance.map(() => 0) }), { face: null, talus: null });
    // foredunes and reef on the synthetic coast grid
    const { grid, heights, cover, coastalZone, faceMask } = coastGrid(), transects = [4].map(z => shoreTransect(grid, heights, 0, shoreline.points_xyz_m, z, { seawardMeters: 300, landwardMeters: 180, labels: { coastalZone } }));
    const corridor = [[1150, 8], [1170, 8], [1170, 0], [1150, 0]], dunes = foreduneMeasure(grid, heights, coastalZone, 0, { transects, corridorPolygon: corridor, districtPolygons: [[[1200, 8], [1250, 8], [1250, 0], [1200, 0]]] });
    // the crest stands 4 m over the backshore, the seaward foot station already carries the hump's tail (0.27 m) and the backshore descends 1 degree
    assert.ok(dunes.medianHeightMeters > 3.4 && dunes.medianHeightMeters < 4 && dunes.transectsWithDunes === 1 && dunes.zonedSamples === 9 * 21, JSON.stringify({ ...dunes, transects: undefined }));
    assert.equal(dunes.corridorSamples, polygonSampleIndices(grid, corridor).length, 'every sample inside the corridor polygon over the dune counts'); assert.ok(dunes.corridorSamples > 100); assert.equal(dunes.districtSamples, 0);
    const sector = bluffSectorPolygon(shoreline.points_xyz_m, { zMin: 0, zMax: 8, seawardMeters: 300, landwardMeters: 50 }), reef = reefMeasure(grid, heights, coastalZone, 0, { sectorPolygon: sector, swimZonePolygon: null });
    assert.ok(reef.sectorSamples > 0 && reef.outsideSectorSamples === 0 && reef.topDepthMeters.p05 >= -4 && reef.topDepthMeters.p95 <= -1, JSON.stringify(reef));
    const face = faceMaskBeyondSlope(grid, heights, cover, faceMask, 0, { slopeDegrees: 65 });
    assert.ok(face.samplesBeyond > 0 && face.maskedFraction === 1 && face.steepestNaturalDegrees > 65, JSON.stringify(face));
    faceMask.fill(0);
    assert.equal(faceMaskBeyondSlope(grid, heights, cover, faceMask, 0, { slopeDegrees: 65 }).maskedFraction, 0);
    // drainage lines: three parallel V valleys of 2, 4 and 6 m depth on a 20 m plane draining south; only the two deeper ones are lines with >= 3 m incision
    const valley = { columns: 129, rows: 129, spacingX: 2, spacingZ: 2, minX: 0, maxZ: 256 }, n = 129 * 129, vh = new Float32Array(n), vc = new Uint8Array(n).fill(2);
    for (let r = 0; r < 129; r++) for (let c = 0; c < 129; c++) { const x = c * 2, z = 256 - r * 2; let h = 20 + z * .01; for (const [cx, depth] of [[40, 1.5], [128, 4], [216, 6]]) h -= depth * Math.max(0, 1 - Math.abs(x - cx) / 24); vh[r * 129 + c] = h; }
    const incision = drainageIncision(valley, vh, vc, 0, { channelAreaM2: 4000, ridgeWindowMeters: 60, lineIncisionMeters: 3, lineMinLengthMeters: 50 });
    assert.ok(incision.lines.count === 2 && incision.lines.networksWithDeepSamples === 2 && incision.lines.deepest[0].maxIncisionMeters > 5.5 && incision.networks === 3, JSON.stringify(incision.lines));
    assert.equal(incision.lines.incisionMeters, 3);
});

test('Target measures: district edges read an embankment as a narrow designed edge and a feather as a wide one, and the evaluator row needs a designed profile', () => {
    // a 200 x 200 m grid at 1 m: a 10 m pad (the square 60..140) over a flat 2 m ground with either a 30 degree embankment or a 60 m smoothstep feather
    const grid = { columns: 201, rows: 201, spacingX: 1, spacingZ: 1, minX: 0, maxZ: 200 }, square = [[60, 140], [140, 140], [140, 60], [60, 60]];
    const distanceOutside = (x, z) => Math.hypot(Math.max(0, 60 - x, x - 140), Math.max(0, 60 - z, z - 140));
    const build = edgeHeight => { const h = new Float32Array(201 * 201); for (let r = 0; r < 201; r++) for (let c = 0; c < 201; c++) { const d = distanceOutside(c, 200 - r); h[r * 201 + c] = d === 0 ? 12 : 2 + edgeHeight(d); } return h; };
    const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const embankment = build(d => Math.max(0, 10 - d * Math.tan(30 * DEGREES))), feather = build(d => 10 * (1 - smooth(0, 60, d)));
    const districts = [{ id: 1, name: 'Pad', boundary_xz_m: square }];
    const [bank] = districtEdgeMeasure(grid, embankment, 0, districts), [soft] = districtEdgeMeasure(grid, feather, 0, districts);
    assert.ok(bank.rays >= 28 && bank.medianEdgeWidthMeters >= 16 && bank.medianEdgeWidthMeters <= 21 && bank.medianBandSlopeDegrees > 20 && Math.abs(bank.medianStepMeters - 10) < .5 && bank.fillRays === bank.rays && bank.unresolvedRays === 0, JSON.stringify(bank));
    assert.ok(soft.medianEdgeWidthMeters >= 40 && soft.medianBandSlopeDegrees < 12, JSON.stringify(soft));
    const sea = build(d => -3);
    assert.equal(districtEdgeMeasure(grid, sea, 0, districts)[0].rays, 0, 'rays into the sea are skipped');
    const diagnosis = passingDiagnosis(), base = { diagnosis, measurements: { beach: [], bluff: [], rim: [], foredune: { medianHeightMeters: null, transectsWithDunes: 0, corridorSamples: 0, districtSamples: 0, zonedSamples: 0 }, reef: { sectorSamples: 0, outsideSectorSamples: 0, swimZoneSamples: 0, topDepthMeters: { p05: null, p95: null } }, faceMask: { samplesBeyond: 1, maskedSamplesBeyond: 1, maskedFraction: 1 } }, planRoadCount: 3 };
    const edgeRow = (edges, profiles) => evaluateCoastalV3({ ...base, measurements: { ...base.measurements, districtEdges: edges }, districtProfiles: profiles }).rows.find(entry => entry.id === 'district-edges');
    assert.equal(edgeRow([bank], { 1: { operatorId: 'districts', profile: 'embankment', combine: 'blend' } }).passed, true);
    assert.equal(edgeRow([bank], { 1: { operatorId: 'districts', profile: 'feather', combine: 'replace' } }).passed, false, 'a feather profile fails even when the edge is narrow');
    assert.equal(edgeRow([soft], { 1: { operatorId: 'districts', profile: 'embankment', combine: 'blend' } }).passed, false, 'a wide edge fails');
    assert.equal(edgeRow([{ ...soft }], { 1: { operatorId: 'plateau', profile: 'escarpment', combine: 'replace' } }).passed, true, 'an escarpment is judged by the rim rows, not the width');
    assert.equal(edgeRow([bank], {}).passed, false, 'a district no operator re-imposes fails');
    assert.ok(/NOT RE-IMPOSED/.test(edgeRow([bank], {}).note));
    // the recipe profiles: the last operator naming a district wins, null districtIds name every district
    const op = (id, type, params) => ({ id, op: type, params, mask: null, seed: null, enabled: true });
    const recipe = { operators: [op('high', 'landform-plateau', { districtId: 4, profile: 'escarpment' }), op('all', 'constrain-districts', { districtIds: null, profile: 'feather' }), op('low', 'constrain-districts', { districtIds: [1, 2], profile: 'embankment', combine: 'blend' }), { ...op('off', 'constrain-districts', { districtIds: [3], profile: 'ramp' }), enabled: false }] };
    const profiles = recipeDistrictProfiles(recipe, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 9 }]);
    assert.deepEqual(Object.fromEntries(Object.entries(profiles).map(([id, value]) => [id, value && `${value.operatorId}:${value.profile}`])), { 1: 'low:embankment', 2: 'low:embankment', 3: 'all:feather', 4: 'all:feather', 9: 'all:feather' });
});

// a diagnosis document holding just what the evaluator reads, with passing values
function passingDiagnosis() {
    const rim = (() => { const distance = [], height = []; for (let s = 0; s <= 400; s += 2) { distance.push(s); height.push(s <= 200 ? 80 : s <= 214 ? 80 - (s - 200) * Math.tan(60 * DEGREES) : s <= 274 ? 55.75 - (s - 214) * Math.tan(33 * DEGREES) : 16.8); } const slope = distance.map((s, i) => { const a = Math.max(0, i - 1), b = Math.min(distance.length - 1, i + 1); return Math.atan((height[b] - height[a]) / (distance[b] - distance[a])) / DEGREES; }); return { distance, height, slopeDegrees: slope }; })();
    const district = (id, name, p05, p95, low, high) => ({ id, name, heights: { p05, p95 }, band: { low, high }, withinBand: p05 >= low && p95 <= high, urbanFlatFraction: .99 });
    return {
        slope: { natural: { fractions: [.5, .2, .15, .08, .04, .02, .006, .004], atLeast20Degrees: { fraction: .031 }, atLeast30Degrees: { fraction: .011 }, percentiles: { p100: 72 } } },
        relief: { windows: [{ meters: 100, natural: { p90: 15 } }, { meters: 500, natural: { p90: 42 } }] },
        incision: { incision: { p90: 2.8 }, lines: { count: 9, incisionMeters: 3, minLengthMeters: 50, networksWithDeepSamples: 12 } },
        edges: { profiles: ['rim-W', 'rim-SW', 'rim-S', 'rim-N'].map(id => ({ id, ...rim })) },
        subtended: { observers: [{ id: 'NW-01', maxElevationDegrees: 1.35, at: { x: 3252, z: 2856, height: 80, distance: 3205 }, aboveHorizonDegrees: 0 }, { id: 'NW-08', maxElevationDegrees: 3.7, at: { x: 3252, z: 2856, height: 80, distance: 925 }, aboveHorizonDegrees: 0 }, { id: 'NW-09', maxElevationDegrees: 1.71, at: { x: 3252, z: 2856, height: 80, distance: 2629 }, aboveHorizonDegrees: -.3 }] },
        constraints: { thresholds: { swimZone: null },
            roads: { passed: true, limits: { sustainedWindowMeters: 50, shortWindowMeters: 20, maxSustainedGradePercent: 6, maxShortGradePercent: 8 }, maxSustainedGradePercent: 5.8, maxShortGradePercent: 5.81, roadsWithViolations: [], roads: Array.from({ length: 3 }, (_, i) => ({ name: `road ${i}` })) },
            districts: { districts: [district(1, 'A', 25.8, 26.2, 24, 28), district(7, 'Beach', 2.55, 2.7, 2, 3)] },
            shoreline: { passed: true, maxDeviationMeters: 2.6, p95DeviationMeters: 2.4, vertices: 801, verticesOutsideTolerance: 0 },
            beachArrival: { passed: true, height: 2.6, targetHeight: 2.6, maxDeviationWithinRadius: 0, maxSlopeWithinRadius: 0, radiusMeters: 10 },
            busStop: { passed: true, meanHeight: 2.6, targetHeight: 2.6, heightRangeMeters: 0, maxSlopeDegrees: 0 },
            viewCorridor: { passed: true, observers: [{ seaVisible: true, firstVisibleSea: { distance: 1166 } }] },
            swimZone: { passed: true, disallowedLandSamples: 0, seabedSlopeDegrees: { p95: 1.9 }, landSamples: 10, waterSamples: 20 },
            seaLevel: { passed: true, seaLevel: 0 }, cover: { passed: true, compared: true, planningMismatches: 0 } }
    };
}

test('Target evaluator: measures the synthetic coast, passes every row with passing values and names the failing rows otherwise', () => {
    const { grid, heights, cover, coastalZone, faceMask } = coastGrid();
    const targets = { ...COASTAL_V3_TARGETS, transects: { beachZ: [2, 4, 6], bluffZ: [2, 4, 6] }, bluffSector: { zMin: 0, zMax: 8, seawardMeters: 300, landwardMeters: 50 } };
    const plan = { districts: [{ id: 1, name: 'Far', boundary_xz_m: [[1250, 8], [1290, 8], [1290, 0], [1250, 0]] }], shoreline, beachPoints: { open_view_corridor_xz_m: [[1200, 8], [1240, 8], [1240, 0], [1200, 0]] } };
    const diagnosis = passingDiagnosis(), measurements = measureCoastalV3(grid, heights, cover, { coastalZone, faceMask }, 0, plan, diagnosis, { targets });
    assert.equal(measurements.beach.length, 3); assert.equal(measurements.bluff.length, 3); assert.equal(measurements.rim.length, 4);
    assert.ok(measurements.beach.every(entry => entry.berm && Math.abs(entry.berm.heightMeters - 1.8) < .05 && Math.abs(entry.berm.distanceMeters - 30) < 2 && Math.abs(entry.foreshoreSlopeDegrees - Math.atan(1 / 20) / DEGREES) < .2), JSON.stringify(measurements.beach.map(e => [e.berm, e.foreshoreSlopeDegrees])));
    const districtProfiles = { 1: { operatorId: 'far', profile: 'embankment', combine: 'blend' } };
    assert.ok(measurements.districtEdges.length === 1 && measurements.districtEdges[0].id === 1 && measurements.districtEdges[0].medianEdgeWidthMeters <= 25, JSON.stringify(measurements.districtEdges));
    const report = evaluateCoastalV3({ diagnosis, measurements, planRoadCount: 3, targets, districtProfiles });
    assert.ok(report.passed, `failed rows: ${report.failed.join(', ')}\n${coastalV3TargetsMarkdown(report)}`);
    assert.equal(report.rows.length, 44); assert.ok(report.rows.every(entry => ['target', 'constraint'].includes(entry.kind) && typeof entry.id === 'string' && 'measured' in entry && typeof entry.target === 'string'));
    assert.equal(report.rows.filter(entry => entry.kind === 'constraint').length, 12);
    const markdown = coastalV3TargetsMarkdown(report);
    assert.ok(markdown.startsWith('# Declared targets (B raised 80 m) and hard constraints: PASS') && markdown.includes('| bathymetry-dean-a | target |'));
    // failing values are named
    const failing = passingDiagnosis();
    failing.slope.natural.fractions = [.7, .2, .06, .02, .01, .005, .003, .002]; failing.subtended.observers[2].maxElevationDegrees = 1.6; failing.constraints.districts.districts[1].withinBand = false; failing.constraints.roads.maxSustainedGradePercent = 6.4; failing.constraints.roads.passed = false;
    const bad = evaluateCoastalV3({ diagnosis: failing, measurements: { ...measurements, reef: { ...measurements.reef, sectorSamples: 0 }, foredune: { ...measurements.foredune, corridorSamples: 3 } }, planRoadCount: 4, targets, districtProfiles });
    assert.equal(bad.passed, false);
    assert.deepEqual(bad.failed, ['slope-share-10', 'beach-foredune-corridor', 'bathymetry-reef', 'subtended-NW-09', 'roads-sustained-grade', 'districts-bands', 'roads-topology', 'roads-grades']);
    assert.ok(coastalV3TargetsMarkdown(bad).includes('FAIL (slope-share-10'));
    assert.equal(medianOf([]), null); assert.equal(medianOf([3, 1, 2]), 2); assert.equal(medianOf([4, 1, 3, 2]), 2);
});

// the straight 512 m coast of the coastal operator tests: design shoreline at x = 300, sea to the west
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const GRID = { columns: 257, rows: 257, spacingX: 2, spacingZ: 2, bounds: { minX: 0, maxX: 512, minZ: 0, maxZ: 512 }, chunkIntervals: 64, maxLevel: 2 };
const ORDER = 'X east, Y elevation, Z north; metres';
const PLAN_FILES = { districts: [{ id: 1, name: 'Hill town', target_elevation_m: 12, typical_design_band_m: '11-13', boundary_xz_m: [[420, 470], [500, 470], [500, 400], [420, 400]] }],
    roads: { coordinate_order: ORDER, roads: [{ name: 'Main', from: 'A', to: 'B', width_m: 7, type: 'collector', length_m: 140, design_max_grade_percent: 1, centerline_xyz_m: Array.from({ length: 36 }, (_, i) => [360 + i * 4, 1, 30]) }] },
    shoreline: { coordinate_order: 'X east, Y sea level, Z north; metres', points_xyz_m: Array.from({ length: 33 }, (_, i) => [300, 0, 512 - i * 16]) },
    beachPoints: { coordinate_order: ORDER, points: [{ name: 'Bus stop reservation', xyz_m: [330, 2.6, 100], footprint_m: [30, 6] }, { name: 'Level beach arrival', xyz_m: [320, 2.6, 80] }], open_view_corridor_xz_m: [[330, 200], [400, 200], [400, 160], [330, 160]] } };
const recipeOf = operators => ({ format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'beach-shelf-test', seed: 3, seaLevel: 0, grid: GRID, working: null,
    inputs: { landscape: { directory: 'synthetic', expectedRevision: null }, plan: { districts: 'd.json', roads: 'r.json', shoreline: 's.json', beachPoints: 'b.json', landCover: null }, imports: [] }, operators, outputs: { heightCap: null, coverPolicy: 'keep-source', channels: ['height'] }, overrides: [] });
const sourceOf = heightAt => (binding, { memory, output }) => {
    const n = output.columns * output.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    for (let r = 0; r < output.rows; r++) for (let c = 0; c < output.columns; c++) { const x = output.minX + c * output.spacingX; heights[r * output.columns + c] = heightAt(x); cover[r * output.columns + c] = x < 300 ? 0 : 2; }
    return { grid: output, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ab'.repeat(32) };
};

test('Coastal beach extension: offshoreMode replace raises a too-deep seabed onto the Dean curve, hands over to the shelf at deanDepthMeters and reports the distances', async () => {
    // a 6 percent ramp seabed (deeper than Dean everywhere beyond a few meters) and the 4 percent land ramp of the D2 coast
    const terrain = x => x < 300 ? -(300 - x) * .06 - .5 : .04 * (x - 300);
    const params = { deanA: .12, offshoreMode: 'replace', deanDepthMeters: 4, shelfSlopeDegrees: 3, shelfFloorDepthMeters: 7, offshoreReachMeters: 290, beachBandMeters: 100, blendMeters: 20, protectPlan: false };
    const run = async operators => executeSynthesisRecipe({ recipe: recipeOf(operators), inputs: { readLandscape: sourceOf(terrain), planFiles: PLAN_FILES }, memory: new TerrainFieldMemory(512 << 20) });
    const plan = op('plan', 'plan-inputs', { apronPolygon: null, runwayPolygon: null }), replaced = await run([op('import', 'import-heights'), plan, op('beach', 'coastal-beach', params)]);
    const statistics = replaced.report.operators[2].statistics, designed = beachProfile({ deanA: .12, foreshoreSlopeRatio: 20, swashDepthMeters: 1, bermHeightMeters: 1.8, bermDistanceMeters: 30, bermFaceRunMeters: 6, bermWidthMeters: 12, backshoreSlopeDegrees: 1, deanDepthMeters: 4, shelfSlopeDegrees: 3, shelfFloorDepthMeters: 7 }, 0);
    assert.equal(statistics.offshoreMode, 'replace'); assert.equal(statistics.deanDepthMeters, 4); assert.equal(statistics.shelfSlopeDegrees, 3);
    assert.ok(Math.abs(statistics.deanDepthDistanceMeters - designed.deanDepthDistance) < 1e-6 && statistics.deanDepthDistanceMeters < -100 && statistics.shelfFloorDistanceMeters < statistics.deanDepthDistanceMeters, JSON.stringify(statistics));
    const z = 256, h = x => sampleHeight(replaced.grid, replaced.heights, x, z);
    for (let x = 60; x <= 276; x += 4) { const d = x - 300; assert.ok(Math.abs(h(x) - designed.heightAt(d)) < .02, `replaced seabed at d=${d}: ${h(x)} vs ${designed.heightAt(d)} (ramp ${terrain(x)})`); }
    assert.ok(h(180) > terrain(180) + 2, 'the seabed was raised onto the Dean curve');
    assert.ok(Math.abs(h(300 + designed.deanDepthDistance) + 4) < .05, 'the handover sits at -4 m');
    assert.ok(Math.abs(h(300 + designed.floorDistance) + 7) < .05 && Math.abs(h(300 + designed.floorDistance - 10) + 7) < .05, 'the shelf flattens at the floor');
    for (let x = 180; x <= 276; x += 8) { const i = Math.round((replaced.grid.maxZ - z) / 2) * replaced.grid.columns + Math.round(x / 2); assert.equal(replaced.layers.depositType[i], 4, `raised seabed is beach sand at x=${x}`); if (x <= 240) assert.ok(replaced.layers.depositThickness[i] > 1, `thick sand fill at x=${x}: ${replaced.layers.depositThickness[i]}`); }
    assert.ok(statistics.raisedSamples > 10000 && statistics.fillVolumeCubicMeters > 100000, JSON.stringify({ raised: statistics.raisedSamples, fill: statistics.fillVolumeCubicMeters }));
    replaced.release();
    // cut mode on the same seabed leaves the deeper ramp alone (the D2 behaviour), the handover is still reported
    const cut = await run([op('import', 'import-heights'), plan, op('beach', 'coastal-beach', { ...params, offshoreMode: 'cut' })]);
    const hc = x => sampleHeight(cut.grid, cut.heights, x, z);
    for (let x = 100; x <= 240; x += 20) assert.ok(Math.abs(hc(x) - terrain(x)) < 1e-5, `cut mode keeps the deeper ramp at x=${x}`);
    assert.equal(cut.report.operators[2].statistics.offshoreMode, 'cut');
    cut.release();
    // the recipe boundary rejects a handover shallower than the swash depth and a floor above the handover
    const { validateLandscapeSynthesisRecipe } = await import('../../../src/app/landscape/index.js');
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf([op('import', 'import-heights'), plan, op('beach', 'coastal-beach', { deanDepthMeters: .5 })])), /deanDepthMeters must exceed swashDepthMeters/);
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf([op('import', 'import-heights'), plan, op('beach', 'coastal-beach', { deanDepthMeters: 8, shelfFloorDepthMeters: 6 })])), /shelfFloorDepthMeters must exceed deanDepthMeters/);
});
