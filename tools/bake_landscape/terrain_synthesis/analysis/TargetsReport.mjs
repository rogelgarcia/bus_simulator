// Evaluates every AI 596 declared target (column B, raised 80 m) and every hard plan constraint of a synthesized coastal terrain as pass/fail rows with the measured value.
// @ts-check
// The declared targets are data (COASTAL_V3_TARGETS: the thresholds of the prompt's "Declared targets" table and the hard plan
// constraints), the measurements come from diagnoseRelief plus the TargetMeasures module (measureCoastalV3), and evaluateCoastalV3
// turns both into {id, kind, measured, target, passed, note} rows so a leaf fails on the first failing row and the receipt shows what
// was measured against what. Medians over transects or rim profiles judge the profile targets (the per-transect values stay in the
// measurements), shares and percentiles come from the diagnosis, and every constraint row repeats the constraint report's verdict.
import { swimZonePolygon } from './ConstraintReport.mjs';
import { barMeasure, cliffPlatformMeasure, deanFit, districtEdgeMeasure, faceMaskBeyondSlope, foreduneMeasure, medianOf, reefMeasure, rimFaceMeasure, shoreTransect } from './TargetMeasures.mjs';

export const COASTAL_V3_TARGETS_FORMAT = 'landscape-coastal-v3-targets';

/** Column B of the AI 596 "Declared targets" table (binding since the D1 decision) and the hard plan constraints, as thresholds. */
export const COASTAL_V3_TARGETS = Object.freeze({
    column: 'B raised 80 m',
    slopeShareMinimum: Object.freeze({ above10Degrees: .10, above20Degrees: .03, above30Degrees: .01 }),
    steepestNaturalSlopeDegrees: 65, faceMaskThreshold: .5,
    reliefP90Minimum: Object.freeze({ '100m': 14, '500m': 40 }),
    rim: Object.freeze({ faceHeightMeters: [20, 30], faceSlopeDegrees: [55, 65], talusSlopeDegrees: [30, 35] }),
    westCliff: Object.freeze({ bandMeters: [55, 120], faceHeightMeters: [10, 16], faceSlopeDegrees: [60, 75], platformWidthMeters: [20, 40], platformHeightMeters: [.5, 1.5] }),
    drainage: Object.freeze({ linesMinimum: 8, lineIncisionMeters: 3, incisionP90Minimum: 2.5 }),
    beach: Object.freeze({ bermHeightMeters: [1.5, 2], bermDistanceMeters: [25, 40], foreshoreSlopeDegrees: [1.9, 3.8], foreduneHeightMeters: [3, 6] }),
    bathymetry: Object.freeze({ deanA: [.10, .14], deanDepthMeters: 8, shelfSlopeDegrees: [1.5, 2.5], shelfFloorDepthMeters: 30, barCrestDepthMeters: [-3, -2], barDistanceMeters: [60, 120], reefTopDepthMeters: [-4, -1] }),
    subtendedMinimumDegrees: Object.freeze({ 'NW-08': 3.5, 'NW-01': 1.3, 'NW-09': 1.7 }),
    roads: Object.freeze({ maxSustainedGradePercent: 6, maxShortGradePercent: 8 }),
    constraints: Object.freeze({ districtSlopeMaxDegrees: 8, districtFlatUrbanMinimumFraction: .95, shorelineToleranceMeters: 10, seaLevel: 0, planningCoverClasses: [5, 6, 7],
        /** designed district edges: never a feather; an edge (the band outside the boundary until the surface flattens) at most this wide unless it is an escarpment, whose face and talus the rim rows judge */
        districtEdgeMaxWidthMeters: 25, districtEdgeProfiles: Object.freeze(['escarpment', 'embankment', 'retaining', 'ramp']) }),
    /** the coastal bluff sector of the plan (the exposed-rock band north of the hillside homes), where the west cliff and the reef are judged */
    bluffSector: Object.freeze({ zMin: 1200, zMax: 3950, seawardMeters: 500, landwardMeters: 200 }),
    transects: Object.freeze({ beachZ: Object.freeze([300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600, 3900]), bluffZ: Object.freeze([1300, 1500, 1700, 1900, 2100, 2300, 2500, 2700, 2900, 3100, 3300, 3500, 3700, 3900]) })
});

const between = (value, [low, high]) => Number.isFinite(value) && value >= low && value <= high;
const row = (id, kind, measured, target, passed, note = null) => ({ id, kind, measured, target, passed: !!passed, note });

/** The sector polygon of the west bluff coast: the design shoreline between zMin and zMax offset seaward and landward. @param {number[][]} shorelinePoints @param {{zMin:number,zMax:number,seawardMeters:number,landwardMeters:number}} sector */
export function bluffSectorPolygon(shorelinePoints, sector) {
    const inside = shorelinePoints.filter(point => point[2] >= sector.zMin && point[2] <= sector.zMax).sort((a, b) => a[2] - b[2]);
    if (inside.length < 2) throw new Error('[SynthesisAnalysis] The design shoreline has fewer than two vertices inside the bluff sector');
    return [...inside.map(point => [point[0] - sector.seawardMeters, point[2]]), ...inside.slice().reverse().map(point => [point[0] + sector.landwardMeters, point[2]])];
}

/**
 * The measurements the declared targets need beyond diagnoseRelief: beach transects (berm, foreshore, Dean fit, shelf, bar, dune), bluff
 * transects (cliff face and platform), rim profiles (face and talus), the reef off the bluff sector, foredune placement and the face mask
 * beyond the steepest slope. `layers` are the engine layers on the measured grid (coastalZone, faceMask).
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover @param {{coastalZone:Uint8Array,faceMask:Float32Array}} layers @param {number} seaLevel
 * @param {{districts:any[],shoreline:{points_xyz_m:number[][]},beachPoints:{open_view_corridor_xz_m?:number[][]}}} plan @param {any} diagnosis
 * @param {{targets?:typeof COASTAL_V3_TARGETS,workingLimitBytes?:number,log?:(message:string)=>void}} [options]
 */
export function measureCoastalV3(grid, heights, cover, layers, seaLevel, plan, diagnosis, options = {}) {
    const targets = options.targets ?? COASTAL_V3_TARGETS, log = options.log ?? (() => {}), points = plan.shoreline.points_xyz_m, started = performance.now();
    const labels = { coastalZone: layers.coastalZone };
    log('[SynthesisAnalysis] targets: beach transects');
    const beach = targets.transects.beachZ.map(z => {
        const transect = shoreTransect(grid, heights, seaLevel, points, z, { seawardMeters: Math.max(0, Math.min(1100, transect0X(points, z) - grid.minX - 1)), landwardMeters: 160, labels });
        const berm = bermOf(transect), foreshore = foreshoreOf(transect), dean = deanFit(transect, { maxDepthMeters: targets.bathymetry.deanDepthMeters, floorDepthMeters: targets.bathymetry.shelfFloorDepthMeters }), bar = barMeasure(transect);
        return { z, shorelineX: transect.shorelineX, crossing: transect.crossing, berm, foreshoreSlopeDegrees: foreshore, dean, bar, transect };
    });
    log('[SynthesisAnalysis] targets: bluff transects');
    const bluff = targets.transects.bluffZ.map(z => {
        const transect = shoreTransect(grid, heights, seaLevel, points, z, { seawardMeters: 50, landwardMeters: 200, labels });
        return { z, shorelineX: transect.shorelineX, crossing: transect.crossing, ...cliffPlatformMeasure(transect, { bandMeters: [...targets.westCliff.bandMeters] }) };
    });
    log('[SynthesisAnalysis] targets: rim profiles, foredunes, reef, face mask');
    const rim = diagnosis.edges.profiles.map(profile => ({ id: profile.id, ...rimFaceMeasure(profile) }));
    const corridor = plan.beachPoints.open_view_corridor_xz_m ?? null, districtPolygons = plan.districts.map(district => district.boundary_xz_m);
    const foredune = foreduneMeasure(grid, heights, layers.coastalZone, seaLevel, { transects: beach.map(entry => entry.transect), corridorPolygon: corridor, districtPolygons });
    const swim = diagnosis.constraints?.thresholds?.swimZone ? swimZonePolygon(plan.shoreline, diagnosis.constraints.thresholds.swimZone) : null;
    const reef = reefMeasure(grid, heights, layers.coastalZone, seaLevel, { sectorPolygon: bluffSectorPolygon(points, targets.bluffSector), swimZonePolygon: swim });
    const face = faceMaskBeyondSlope(grid, heights, cover, layers.faceMask, seaLevel, { slopeDegrees: targets.steepestNaturalSlopeDegrees, maskThreshold: targets.faceMaskThreshold, workingLimitBytes: options.workingLimitBytes });
    log('[SynthesisAnalysis] targets: district edges');
    const districtEdges = districtEdgeMeasure(grid, heights, seaLevel, plan.districts);
    return { format: 'landscape-coastal-v3-measurements', beach: beach.map(({ transect, ...entry }) => entry), bluff, rim, foredune, reef, faceMask: face, districtEdges, seconds: (performance.now() - started) / 1000 };
}

/**
 * The edge profile every plan district receives from a validated recipe: the last enabled constrain-districts or landform-plateau operator
 * naming it (districtIds null names every district), or null when nothing re-imposes it.
 * @param {any} recipe validated recipe @param {{id:number}[]} districts
 * @returns {Record<number,{operatorId:string,profile:string,combine:string}|null>}
 */
export function recipeDistrictProfiles(recipe, districts) {
    const profiles = Object.fromEntries(districts.map(district => [district.id, null]));
    for (const operator of recipe.operators) {
        if (!operator.enabled) continue;
        const ids = operator.op === 'constrain-districts' ? operator.params.districtIds ?? districts.map(district => district.id) : operator.op === 'landform-plateau' && operator.params.districtId ? [operator.params.districtId] : null;
        if (!ids) continue;
        for (const id of ids) if (Object.hasOwn(profiles, id)) profiles[id] = { operatorId: operator.id, profile: operator.params.profile ?? 'escarpment', combine: operator.params.combine ?? 'max' };
    }
    return profiles;
}

const transect0X = (points, z) => { let best = null; for (let i = 1; i < points.length; i++) { const z0 = points[i - 1][2], z1 = points[i][2]; if ((z0 - z) * (z1 - z) <= 0 && z0 !== z1 && best === null) best = points[i - 1][0] + (points[i][0] - points[i - 1][0]) * (z - z0) / (z1 - z0); } return best ?? points[0][0]; };

// the berm of a transect: the first local maximum landward of the crossing within 60 m (height above sea level, distance from the crossing)
function bermOf(transect) {
    const { d, height } = transect.stations, seaLevel = transect.seaLevel, crossing = transect.crossing;
    if (crossing === null) return null;
    for (let i = 1; i + 1 < d.length; i++) {
        const landward = d[i] - crossing;
        if (landward <= 0) continue;
        if (landward > 60) break;
        if (height[i] > height[i - 1] && height[i] >= height[i + 1] && height[i] > seaLevel) return { heightMeters: height[i] - seaLevel, distanceMeters: landward };
    }
    return null;
}

// the foreshore slope of a transect: from the crossing to the +1 m crossing
function foreshoreOf(transect) {
    const { d, height } = transect.stations, seaLevel = transect.seaLevel, crossing = transect.crossing;
    if (crossing === null) return null;
    for (let i = 1; i < d.length; i++) {
        if (d[i] <= crossing || height[i] < seaLevel + 1) continue;
        const rise = height[i - 1] < seaLevel + 1 ? d[i - 1] + (d[i] - d[i - 1]) * (seaLevel + 1 - height[i - 1]) / (height[i] - height[i - 1]) : d[i], run = rise - crossing;
        return run > 0 ? Math.atan(1 / run) * 180 / Math.PI : 90;
    }
    return null;
}

/**
 * Pass/fail rows for every declared target and hard constraint.
 * @param {{diagnosis:any,measurements:ReturnType<typeof measureCoastalV3>,planRoadCount:number,targets?:typeof COASTAL_V3_TARGETS,headlands?:any[],districtProfiles?:Record<number,{operatorId:string,profile:string}|null>}} options
 */
export function evaluateCoastalV3({ diagnosis, measurements, planRoadCount, targets = COASTAL_V3_TARGETS, headlands = [], districtProfiles = {} }) {
    const rows = [], natural = diagnosis.slope.natural, above10 = natural.fractions.slice(3).reduce((a, b) => a + b, 0);
    const relief = meters => diagnosis.relief.windows.find(window => window.meters === meters)?.natural.p90 ?? null;
    rows.push(row('slope-share-10', 'target', above10, `>= ${targets.slopeShareMinimum.above10Degrees}`, above10 >= targets.slopeShareMinimum.above10Degrees, 'share of natural land at or above 10 degrees'));
    rows.push(row('slope-share-20', 'target', natural.atLeast20Degrees.fraction, `>= ${targets.slopeShareMinimum.above20Degrees}`, natural.atLeast20Degrees.fraction >= targets.slopeShareMinimum.above20Degrees, 'share of natural land at or above 20 degrees'));
    rows.push(row('slope-share-30', 'target', natural.atLeast30Degrees.fraction, `>= ${targets.slopeShareMinimum.above30Degrees}`, natural.atLeast30Degrees.fraction >= targets.slopeShareMinimum.above30Degrees, 'share of natural land at or above 30 degrees'));
    rows.push(row('steepest-natural-slope', 'target', natural.percentiles.p100, `>= ${targets.steepestNaturalSlopeDegrees} deg`, natural.percentiles.p100 >= targets.steepestNaturalSlopeDegrees, 'steepest natural slope (degrees)'));
    const face = measurements.faceMask;
    rows.push(row('face-mask-beyond', 'target', face.maskedFraction, `every natural sample at or beyond ${targets.steepestNaturalSlopeDegrees} deg carries face mask >= ${targets.faceMaskThreshold}`, face.samplesBeyond > 0 && face.maskedFraction >= 1 - 1e-9, `${face.maskedSamplesBeyond} of ${face.samplesBeyond} samples`));
    rows.push(row('relief-p90-100m', 'target', relief(100), `>= ${targets.reliefP90Minimum['100m']} m`, relief(100) >= targets.reliefP90Minimum['100m'], 'local relief p90 over 100 m on natural land'));
    rows.push(row('relief-p90-500m', 'target', relief(500), `>= ${targets.reliefP90Minimum['500m']} m`, relief(500) >= targets.reliefP90Minimum['500m'], 'local relief p90 over 500 m on natural land'));
    const rimFaces = measurements.rim.filter(entry => entry.face), rimTalus = measurements.rim.filter(entry => entry.talus);
    const rimHeight = medianOf(rimFaces.map(entry => entry.face.dropMeters)), rimSlope = medianOf(rimFaces.map(entry => entry.face.slopeDegrees)), talusSlope = medianOf(rimTalus.map(entry => entry.talus.slopeDegrees));
    const rimNote = `median of ${rimFaces.length} rim profiles with a face (${measurements.rim.map(entry => `${entry.id}: ${entry.face ? `${entry.face.dropMeters.toFixed(1)} m at ${entry.face.slopeDegrees.toFixed(1)} deg` : 'no face'}${entry.talus ? `, talus ${entry.talus.slopeDegrees.toFixed(1)} deg` : ''}`).join('; ')})`;
    rows.push(row('rim-face-height', 'target', rimHeight, `${targets.rim.faceHeightMeters[0]}..${targets.rim.faceHeightMeters[1]} m`, between(rimHeight, targets.rim.faceHeightMeters), rimNote));
    rows.push(row('rim-face-slope', 'target', rimSlope, `${targets.rim.faceSlopeDegrees[0]}..${targets.rim.faceSlopeDegrees[1]} deg`, between(rimSlope, targets.rim.faceSlopeDegrees), rimNote));
    rows.push(row('rim-talus-slope', 'target', talusSlope, `${targets.rim.talusSlopeDegrees[0]}..${targets.rim.talusSlopeDegrees[1]} deg`, between(talusSlope, targets.rim.talusSlopeDegrees), `median of ${rimTalus.length} rim profiles with a talus`));
    const cliffs = measurements.bluff.filter(entry => entry.face), platforms = measurements.bluff.filter(entry => entry.platform);
    const cliffHeight = medianOf(cliffs.map(entry => entry.face.heightMeters)), cliffSlope = medianOf(cliffs.map(entry => entry.face.slopeDegrees));
    const cliffInBand = cliffs.filter(entry => entry.face.footMeters >= targets.westCliff.bandMeters[0] && entry.face.crestMeters <= targets.westCliff.bandMeters[1] + 10).length;
    const cliffNote = `${cliffs.length} of ${measurements.bluff.length} bluff transects with a face, ${cliffInBand} inside the ${targets.westCliff.bandMeters.join('..')} m band (${measurements.bluff.map(entry => `Z ${entry.z}: ${entry.face ? `${entry.face.heightMeters.toFixed(1)} m at ${entry.face.slopeDegrees.toFixed(0)} deg, foot ${entry.face.footMeters.toFixed(0)} m` : 'no face'}`).join('; ')})`;
    rows.push(row('west-cliff-face-height', 'target', cliffHeight, `${targets.westCliff.faceHeightMeters[0]}..${targets.westCliff.faceHeightMeters[1]} m`, between(cliffHeight, targets.westCliff.faceHeightMeters) && cliffInBand >= Math.ceil(measurements.bluff.length / 2), cliffNote));
    rows.push(row('west-cliff-face-slope', 'target', cliffSlope, `${targets.westCliff.faceSlopeDegrees[0]}..${targets.westCliff.faceSlopeDegrees[1]} deg`, between(cliffSlope, targets.westCliff.faceSlopeDegrees), `median of ${cliffs.length} faces`));
    const platformWidth = medianOf(platforms.map(entry => entry.platform.widthMeters)), platformHeight = medianOf(platforms.map(entry => entry.platform.meanHeightMeters));
    rows.push(row('west-cliff-platform-width', 'target', platformWidth, `${targets.westCliff.platformWidthMeters[0]}..${targets.westCliff.platformWidthMeters[1]} m`, between(platformWidth, targets.westCliff.platformWidthMeters) && platforms.length >= Math.ceil(measurements.bluff.length / 2), `median of ${platforms.length} transects with a platform (${platforms.map(entry => `Z ${entry.z}: ${entry.platform.widthMeters.toFixed(0)} m at +${entry.platform.meanHeightMeters.toFixed(2)} m`).join('; ')})`));
    rows.push(row('west-cliff-platform-height', 'target', platformHeight, `+${targets.westCliff.platformHeightMeters[0]}..+${targets.westCliff.platformHeightMeters[1]} m`, between(platformHeight, targets.westCliff.platformHeightMeters), `median platform height above sea level`));
    const lines = diagnosis.incision.lines;
    rows.push(row('drainage-lines', 'target', lines.count, `>= ${targets.drainage.linesMinimum} lines with >= ${targets.drainage.lineIncisionMeters} m incision`, lines.count >= targets.drainage.linesMinimum && lines.incisionMeters === targets.drainage.lineIncisionMeters, `networks with at least ${lines.minLengthMeters} m of natural channel incised ${lines.incisionMeters} m or more (${lines.networksWithDeepSamples} networks hold any such sample)`));
    rows.push(row('drainage-incision-p90', 'target', diagnosis.incision.incision.p90, `>= ${targets.drainage.incisionP90Minimum} m`, diagnosis.incision.incision.p90 >= targets.drainage.incisionP90Minimum, 'incision p90 over channel samples'));
    const berms = measurements.beach.filter(entry => entry.berm), bermHeight = medianOf(berms.map(entry => entry.berm.heightMeters)), bermDistance = medianOf(berms.map(entry => entry.berm.distanceMeters));
    const beachNote = `${berms.length} of ${measurements.beach.length} beach transects with a berm (${measurements.beach.map(entry => `Z ${entry.z}: ${entry.berm ? `${entry.berm.heightMeters.toFixed(2)} m at ${entry.berm.distanceMeters.toFixed(0)} m` : 'no berm'}`).join('; ')})`;
    rows.push(row('beach-berm-height', 'target', bermHeight, `${targets.beach.bermHeightMeters[0]}..${targets.beach.bermHeightMeters[1]} m`, between(bermHeight, targets.beach.bermHeightMeters) && berms.length >= Math.ceil(measurements.beach.length / 2), beachNote));
    rows.push(row('beach-berm-distance', 'target', bermDistance, `${targets.beach.bermDistanceMeters[0]}..${targets.beach.bermDistanceMeters[1]} m from the waterline`, between(bermDistance, targets.beach.bermDistanceMeters), 'median berm distance'));
    const foreshore = medianOf(measurements.beach.map(entry => entry.foreshoreSlopeDegrees));
    rows.push(row('beach-foreshore-slope', 'target', foreshore, `${targets.beach.foreshoreSlopeDegrees[0]}..${targets.beach.foreshoreSlopeDegrees[1]} deg`, between(foreshore, targets.beach.foreshoreSlopeDegrees), `median over ${measurements.beach.length} transects (${measurements.beach.map(entry => `Z ${entry.z}: ${entry.foreshoreSlopeDegrees === null ? 'n/a' : entry.foreshoreSlopeDegrees.toFixed(2)}`).join('; ')})`));
    const dune = measurements.foredune;
    rows.push(row('beach-foredune-height', 'target', dune.medianHeightMeters, `${targets.beach.foreduneHeightMeters[0]}..${targets.beach.foreduneHeightMeters[1]} m where space permits`, dune.transectsWithDunes > 0 && between(dune.medianHeightMeters, targets.beach.foreduneHeightMeters), `${dune.transectsWithDunes} of ${measurements.beach.length} transects carry a foredune; ${dune.zonedSamples} foredune samples`));
    rows.push(row('beach-foredune-corridor', 'target', dune.corridorSamples + dune.districtSamples, 'no foredune sample inside the open-view corridor or a district', dune.corridorSamples === 0 && dune.districtSamples === 0, `${dune.corridorSamples} in the corridor, ${dune.districtSamples} in districts`));
    const fits = measurements.beach.filter(entry => entry.dean.fitted), deanA = medianOf(fits.map(entry => entry.dean.A)), reach = fits.filter(entry => entry.dean.depthReachDistanceMeters !== null);
    rows.push(row('bathymetry-dean-a', 'target', deanA, `${targets.bathymetry.deanA[0]}..${targets.bathymetry.deanA[1]} m^(1/3)`, between(deanA, targets.bathymetry.deanA) && fits.length >= Math.ceil(measurements.beach.length / 2), `median least-squares A over ${fits.length} transects (${measurements.beach.map(entry => `Z ${entry.z}: ${entry.dean.fitted ? `${entry.dean.A.toFixed(3)} (rmse ${entry.dean.rmse.toFixed(2)} m)` : entry.dean.reason}`).join('; ')})`));
    rows.push(row('bathymetry-dean-depth', 'target', medianOf(reach.map(entry => entry.dean.depthReachDistanceMeters)), `the profile reaches -${targets.bathymetry.deanDepthMeters} m on every transect`, reach.length === measurements.beach.length, `median distance of the -${targets.bathymetry.deanDepthMeters} m crossing over ${reach.length} transects`));
    const shelves = reach.filter(entry => entry.dean.shelf && entry.dean.shelf.slopeDegrees !== null), shelfSlope = medianOf(shelves.map(entry => entry.dean.shelf.slopeDegrees));
    rows.push(row('bathymetry-shelf-slope', 'target', shelfSlope, `${targets.bathymetry.shelfSlopeDegrees[0]}..${targets.bathymetry.shelfSlopeDegrees[1]} deg from -${targets.bathymetry.deanDepthMeters} m to -${targets.bathymetry.shelfFloorDepthMeters} m`, between(shelfSlope, targets.bathymetry.shelfSlopeDegrees) && shelves.length >= Math.ceil(measurements.beach.length / 2), `median over ${shelves.length} transects; floor reached on ${shelves.filter(entry => entry.dean.shelf.floorReached).length} (the sea is narrower than the shelf elsewhere, measured to the deepest station)`));
    const bars = measurements.beach.filter(entry => entry.bar), barDepth = medianOf(bars.map(entry => entry.bar.crestDepthMeters)), barDistance = medianOf(bars.map(entry => entry.bar.distanceMeters));
    const barNote = `${bars.length} of ${measurements.beach.length} transects with a bar crest (${measurements.beach.map(entry => `Z ${entry.z}: ${entry.bar ? `${entry.bar.crestDepthMeters.toFixed(2)} m at ${entry.bar.distanceMeters.toFixed(0)} m` : 'none'}`).join('; ')})`;
    rows.push(row('bathymetry-bar-depth', 'target', barDepth, `${targets.bathymetry.barCrestDepthMeters[0]}..${targets.bathymetry.barCrestDepthMeters[1]} m`, between(barDepth, targets.bathymetry.barCrestDepthMeters) && bars.length >= Math.ceil(measurements.beach.length / 2), barNote));
    rows.push(row('bathymetry-bar-distance', 'target', barDistance, `${targets.bathymetry.barDistanceMeters[0]}..${targets.bathymetry.barDistanceMeters[1]} m seaward`, between(barDistance, targets.bathymetry.barDistanceMeters), 'median bar crest distance'));
    const reef = measurements.reef, reefBand = [targets.bathymetry.reefTopDepthMeters[0] - .05, targets.bathymetry.reefTopDepthMeters[1] + .05];
    rows.push(row('bathymetry-reef', 'target', reef.topDepthMeters, `reef off the bluff sector with tops ${targets.bathymetry.reefTopDepthMeters[0]}..${targets.bathymetry.reefTopDepthMeters[1]} m, none in the swim zone`, reef.sectorSamples > 0 && between(reef.topDepthMeters.p05, reefBand) && between(reef.topDepthMeters.p95, reefBand) && reef.swimZoneSamples === 0, `${reef.sectorSamples} reef samples in the sector, ${reef.outsideSectorSamples} outside, ${reef.swimZoneSamples} in the swim zone`));
    for (const [id, minimum] of Object.entries(targets.subtendedMinimumDegrees)) {
        const observer = diagnosis.subtended.observers.find(entry => entry.id === id);
        rows.push(row(`subtended-${id}`, 'target', observer?.maxElevationDegrees ?? null, `>= ${minimum} deg`, observer && observer.maxElevationDegrees >= minimum, observer ? `rim sample (${observer.at?.x.toFixed(0)}, ${observer.at?.z.toFixed(0)}) h ${observer.at?.height.toFixed(1)} m at ${observer.at?.distance.toFixed(0)} m, ${observer.aboveHorizonDegrees?.toFixed(2)} deg above the foreground horizon` : 'observer not measured'));
    }
    const roads = diagnosis.constraints.roads;
    rows.push(row('roads-sustained-grade', 'target', roads.maxSustainedGradePercent, `<= ${targets.roads.maxSustainedGradePercent}% over ${roads.limits.sustainedWindowMeters} m`, roads.maxSustainedGradePercent <= targets.roads.maxSustainedGradePercent, roads.roadsWithViolations.length ? `violations on ${roads.roadsWithViolations.join(', ')}` : 'every plan road'));
    rows.push(row('roads-short-grade', 'target', roads.maxShortGradePercent, `<= ${targets.roads.maxShortGradePercent}% over ${roads.limits.shortWindowMeters} m`, roads.maxShortGradePercent <= targets.roads.maxShortGradePercent, 'every plan road'));
    // hard plan constraints (the constraint report's verdicts, one row each)
    const c = diagnosis.constraints, districts = c.districts.districts;
    rows.push(row('districts-bands', 'constraint', districts.map(d => ({ id: d.id, p05: d.heights.p05, p95: d.heights.p95 })), 'every district p05..p95 inside its design band', districts.every(d => d.withinBand), districts.map(d => `${d.id} ${d.name}: ${d.heights.p05.toFixed(2)}..${d.heights.p95.toFixed(2)} in ${d.band.low}..${d.band.high}${d.withinBand ? '' : ' FAIL'}`).join('; ')));
    rows.push(row('districts-flat', 'constraint', districts.map(d => ({ id: d.id, urbanFlatFraction: d.urbanFlatFraction })), `>= ${targets.constraints.districtFlatUrbanMinimumFraction} of the urban samples below ${targets.constraints.districtSlopeMaxDegrees} deg`, districts.every(d => d.urbanFlatFraction === null || d.urbanFlatFraction >= targets.constraints.districtFlatUrbanMinimumFraction), districts.map(d => `${d.id}: ${d.urbanFlatFraction === null ? 'no urban cover' : (d.urbanFlatFraction * 100).toFixed(2) + '%'}`).join('; ')));
    // designed edges: the recipe profile of every district (never a feather) and the measured edge outside its boundary
    const edges = (measurements.districtEdges ?? []).map(edge => {
        const profile = districtProfiles[edge.id] ?? null, designed = profile !== null && targets.constraints.districtEdgeProfiles.includes(profile.profile);
        const narrow = edge.medianEdgeWidthMeters !== null && (profile?.profile === 'escarpment' || edge.medianEdgeWidthMeters <= targets.constraints.districtEdgeMaxWidthMeters);
        return { id: edge.id, name: edge.name, profile: profile?.profile ?? null, operatorId: profile?.operatorId ?? null, medianBandSlopeDegrees: edge.medianBandSlopeDegrees, medianEdgeWidthMeters: edge.medianEdgeWidthMeters, p90EdgeWidthMeters: edge.p90EdgeWidthMeters, medianStepMeters: edge.medianStepMeters, rays: edge.rays, fillRays: edge.fillRays, cutRays: edge.cutRays, passed: designed && narrow };
    });
    rows.push(row('district-edges', 'constraint', edges.map(({ id, profile, medianBandSlopeDegrees, medianEdgeWidthMeters }) => ({ id, profile, medianBandSlopeDegrees, medianEdgeWidthMeters })), `every district edge a designed treatment (${targets.constraints.districtEdgeProfiles.join(', ')}; never feather) at most ${targets.constraints.districtEdgeMaxWidthMeters} m wide unless an escarpment`, edges.length > 0 && edges.every(edge => edge.passed),
        edges.map(edge => `${edge.id} ${edge.name}: ${edge.profile ?? 'NOT RE-IMPOSED'}${edge.operatorId ? ` (${edge.operatorId})` : ''}, band slope ${edge.medianBandSlopeDegrees?.toFixed(1)} deg, edge width median ${edge.medianEdgeWidthMeters?.toFixed(0)} m p90 ${edge.p90EdgeWidthMeters?.toFixed(0)} m, step ${edge.medianStepMeters?.toFixed(1)} m over ${edge.rays} rays (${edge.fillRays} fill, ${edge.cutRays} cut)${edge.passed ? '' : ' FAIL'}`).join('; ')));
    rows.push(row('roads-topology', 'constraint', roads.roads.length, `${planRoadCount} plan roads measured on their alignments`, roads.roads.length === planRoadCount, 'every plan road keeps its network alignment (no realignment)'));
    rows.push(row('roads-grades', 'constraint', { sustained: roads.maxSustainedGradePercent, short: roads.maxShortGradePercent }, `<= ${roads.limits.maxSustainedGradePercent}% sustained, <= ${roads.limits.maxShortGradePercent}% short on every plan road`, roads.passed, roads.roadsWithViolations.length ? `violations on ${roads.roadsWithViolations.join(', ')}` : 'pass'));
    rows.push(row('shoreline', 'constraint', c.shoreline.maxDeviationMeters, `every design vertex within +/-${targets.constraints.shorelineToleranceMeters} m`, c.shoreline.passed, `${c.shoreline.verticesOutsideTolerance} of ${c.shoreline.vertices} vertices outside; p95 ${c.shoreline.p95DeviationMeters.toFixed(2)} m; deliberate headlands or coves: ${headlands.length ? headlands.map(entry => entry.id).join(', ') : 'none'}`));
    rows.push(row('beach-arrival', 'constraint', { height: c.beachArrival.height, maxSlope: c.beachArrival.maxSlopeWithinRadius }, `flush at ${c.beachArrival.targetHeight} m, no walls or boulders`, c.beachArrival.passed, `max |h - target| ${c.beachArrival.maxDeviationWithinRadius.toFixed(3)} m within ${c.beachArrival.radiusMeters} m`));
    rows.push(row('bus-stop', 'constraint', { mean: c.busStop.meanHeight, range: c.busStop.heightRangeMeters }, `kept at ${c.busStop.targetHeight} m`, c.busStop.passed, `height range ${c.busStop.heightRangeMeters?.toFixed(3)} m, max slope ${c.busStop.maxSlopeDegrees.toFixed(2)} deg`));
    rows.push(row('view-corridor', 'constraint', c.viewCorridor.observers[0].seaVisible, 'sea visible from the upper end of the descent road', c.viewCorridor.passed, c.viewCorridor.observers[0].firstVisibleSea ? `sea visible from ${c.viewCorridor.observers[0].firstVisibleSea.distance.toFixed(0)} m` : 'no sea visible'));
    rows.push(row('swim-zone', 'constraint', { disallowedLandSamples: c.swimZone.disallowedLandSamples, seabedSlopeP95: c.swimZone.seabedSlopeDegrees.p95 }, 'clean sandy seabed and sand on land', c.swimZone.passed, `${c.swimZone.landSamples} land / ${c.swimZone.waterSamples} water samples`));
    rows.push(row('sea-level', 'constraint', c.seaLevel.seaLevel, `Y = ${targets.constraints.seaLevel}`, c.seaLevel.passed, null));
    rows.push(row('planning-cover', 'constraint', c.cover.planningMismatches, 'planning classes 5-7 identical to the source cover', c.cover.passed && c.cover.compared, c.cover.compared ? `${c.cover.planningMismatches} mismatches` : 'no source cover supplied'));
    const failed = rows.filter(entry => !entry.passed).map(entry => entry.id);
    return { format: COASTAL_V3_TARGETS_FORMAT, schemaVersion: 1, column: targets.column, passed: failed.length === 0, failed, rows };
}

const f = value => (value === null || value === undefined ? 'n/a' : typeof value === 'number' ? (Number.isInteger(value) ? String(value) : value.toFixed(3)) : typeof value === 'boolean' ? String(value) : JSON.stringify(value));

/** @param {ReturnType<typeof evaluateCoastalV3>} report */
export function coastalV3TargetsMarkdown(report) {
    const lines = [`# Declared targets (${report.column}) and hard constraints: ${report.passed ? 'PASS' : `FAIL (${report.failed.join(', ')})`}`, '', '| id | kind | measured | target | result | note |', '| --- | --- | --- | --- | --- | --- |'];
    for (const entry of report.rows) lines.push(`| ${entry.id} | ${entry.kind} | ${f(entry.measured)} | ${entry.target} | ${entry.passed ? 'pass' : 'FAIL'} | ${entry.note ?? ''} |`);
    return lines.join('\n') + '\n';
}
