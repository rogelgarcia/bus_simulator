// Implements the constraint operators: districts, roads, shoreline, points (beach arrival, bus stop, view corridor), runway and height cap.
// @ts-check
// Constraints re-impose the plan with designed edges instead of wide feathers: districts replace or band-clamp their target surface
// and carry the plateau edge profile outward; roads follow grade-limited centerline profiles (RoadProfiles) rasterized to the exact
// carriageway with cut and fill shoulders that only daylight into the ground; the shoreline is held inside a sloped envelope around
// the design line so the sea-level crossing stays within the tolerance; pads and the corridor are smoothstep-blended targets as in the
// v2 generator; the height cap is a hard clip or a rational soft shoulder. Every change is scaled by the operator mask.
import { createEdgeProfile } from './EdgeProfiles.mjs';
import { rasterizeRoadLayers } from './Inputs.mjs';
import { applyPlateau, sampleHeight } from './Landforms.mjs';
import { polygonCentroid, polygonSignedDistance, rasterizePolygon } from './Polygons.mjs';
import { centerlineStations, levelJunctions, maxGradePercent, networkGradeLimitedProfiles, smoothProfile } from './RoadProfiles.mjs';

const DEGREES = Math.PI / 180, DIAGONAL = Math.SQRT2;
const round6 = value => Math.round(value * 1e6) / 1e6;
const smooth = (edge0, edge1, value) => { const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

// chamfer lower envelope with cones of slope `tangent` restricted to the samples where `region` is set (two raster passes, 8 neighbors)
function limitSlopeInside(grid, heights, region, tangent) {
    const { columns, rows, spacingX, spacingZ } = grid, rise = [spacingZ, Math.hypot(spacingX, spacingZ), spacingX].map(step => step * tangent);
    const relax = (i, j, cost) => { if (region[j] && heights[j] + cost < heights[i]) heights[i] = heights[j] + cost; };
    let changed = 0;
    const before = new Float32Array(heights);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        if (!region[i]) continue;
        if (row > 0) { relax(i, i - columns, rise[0]); if (column > 0) relax(i, i - columns - 1, rise[1]); if (column + 1 < columns) relax(i, i - columns + 1, rise[1]); }
        if (column > 0) relax(i, i - 1, rise[2]);
    }
    for (let row = rows - 1; row >= 0; row--) for (let column = columns - 1; column >= 0; column--) {
        const i = row * columns + column;
        if (!region[i]) continue;
        if (row + 1 < rows) { relax(i, i + columns, rise[0]); if (column > 0) relax(i, i + columns - 1, rise[1]); if (column + 1 < columns) relax(i, i + columns + 1, rise[1]); }
        if (column + 1 < columns) relax(i, i + 1, rise[2]);
    }
    for (let i = 0; i < heights.length; i++) if (heights[i] !== before[i]) changed++;
    return changed;
}

async function constrainDistricts(context) {
    const { params } = context.operator, { grid, scope } = context, n = grid.columns * grid.rows;
    if (!context.plan) throw new Error(`[Synthesis] operator ${context.operator.id}: constrain-districts needs plan-inputs before it`);
    const ids = params.districtIds ?? context.plan.districts.map(district => district.id), profile = createEdgeProfile(params), districts = {};
    const region = params.inside === 'band' ? scope.allocate('district-region', Uint8Array, n) : null;
    for (const id of ids) {
        const district = context.plan.districts.find(entry => entry.id === id);
        if (!district) throw new Error(`[Synthesis] operator ${context.operator.id}: district ${id} is not in the plan (ids ${context.plan.districts.map(entry => entry.id).join(', ')})`);
        const target = { polygon: district.polygon, heightMeters: params.heightOverrideMeters ?? district.targetMeters, tiltEastMetersPerKm: params.tiltEastMetersPerKm, tiltNorthMetersPerKm: params.tiltNorthMetersPerKm };
        const inside = params.inside === 'replace' ? T => T : (T, G) => Math.min(T + params.bandMeters, Math.max(T - params.bandMeters, G));
        districts[id] = { name: district.name, targetMeters: target.heightMeters, ...applyPlateau(context, target, params, profile, inside) };
        if (region) rasterizePolygon(grid, district.polygon, region, 1);
    }
    let slopeLimited = 0;
    if (region) {
        // the chamfer metric overestimates diagonal distances by up to 1/cos(22.5 deg); the reduced tangent keeps the true gradient within the limit
        slopeLimited = limitSlopeInside(grid, context.layers.get('height'), region, Math.tan(params.maxSlopeDegrees * DEGREES) * Math.cos(Math.PI / 8));
        scope.free('district-region');
    }
    return { inside: params.inside, profile: params.profile, districts, slopeLimitedSamples: slopeLimited };
}

async function constrainRoads(context) {
    const { params } = context.operator, { grid } = context, { columns, rows } = grid, n = columns * rows, heights = context.layers.get('height'), mask = context.mask();
    if (!context.plan) throw new Error(`[Synthesis] operator ${context.operator.id}: constrain-roads needs plan-inputs before it`);
    const selected = params.roadNames === null ? context.plan.roads : params.roadNames.map(name => {
        const road = context.plan.roads.find(entry => entry.name === name);
        if (!road) throw new Error(`[Synthesis] operator ${context.operator.id}: road "${name}" is not in the plan`);
        return road;
    });
    if (!selected.length) throw new Error(`[Synthesis] operator ${context.operator.id}: the plan has no road to constrain`);
    const constrained = new Set(selected.map(road => road.index)), reports = [], profiled = [];
    const districtId = context.layers.get('districtId');
    const districtAt = (x, z) => districtId[Math.min(rows - 1, Math.max(0, Math.round((grid.maxZ - z) / grid.spacingZ))) * columns + Math.min(columns - 1, Math.max(0, Math.round((x - grid.minX) / grid.spacingX)))];
    const prepared = selected.map(road => {
        const stations = centerlineStations(road.points), raw = new Float64Array(road.points.length), x = new Float64Array(road.points.length), z = new Float64Array(road.points.length), anchor = new Uint8Array(road.points.length);
        const last = stations.length - 1;
        for (let i = 0; i < raw.length; i++) {
            x[i] = road.points[i][0]; z[i] = road.points[i][2];
            raw[i] = params.profileSource === 'design' ? road.points[i][1] : sampleHeight(grid, heights, x[i], z[i]);
            // district interiors are designed surfaces and the level end sections are the node heights: both are held exactly
            anchor[i] = districtAt(x[i], z[i]) > 0 || stations[i] <= params.junctionLevelMeters || stations[last] - stations[i] <= params.junctionLevelMeters ? 1 : 0;
        }
        const target = levelJunctions(stations, params.profileSmoothingMeters > 0 ? smoothProfile(stations, raw, params.profileSmoothingMeters) : Float64Array.from(raw), raw, params.junctionLevelMeters);
        return { road, stations, raw, target, anchor, x, z };
    });
    const network = networkGradeLimitedProfiles(prepared, { maxGradePercent: params.maxGradePercent, couplingMeters: params.couplingMeters });
    const fitted = new Map(prepared.map((entry, k) => [entry.road.index, { ...entry, profile: network.profiles[k], conflicts: network.conflicts[k] }]));
    let worstGrade = 0, infeasible = 0;
    for (const road of context.plan.roads) {
        if (!constrained.has(road.index)) { profiled.push(road); continue; }
        const { stations, raw, profile, conflicts, anchor } = fitted.get(road.index), grade = maxGradePercent(stations, profile), last = profile.length - 1;
        let conflictStations = 0, anchoredStations = 0;
        for (let i = 0; i <= last; i++) { conflictStations += conflicts[i]; anchoredStations += anchor[i]; }
        const endDeviation = [Math.abs(profile[0] - raw[0]), Math.abs(profile[last] - raw[last])], feasible = conflictStations === 0 && Math.max(...endDeviation) <= params.endFitToleranceMeters;
        if (!feasible) infeasible++;
        worstGrade = Math.max(worstGrade, grade);
        profiled.push({ ...road, points: road.points.map((point, i) => [point[0], profile[i], point[2]]) });
        reports.push({ name: road.name, lengthMeters: round6(stations[last]), stations: stations.length, feasible, anchoredStations, conflictStations, endDeviationMeters: endDeviation.map(round6), maxGradePercent: round6(grade), sampledMaxGradePercent: round6(maxGradePercent(stations, raw)),
            designMaxGradePercent: road.designMaxGradePercent, endHeightsMeters: [round6(profile[0]), round6(profile[last])] });
    }
    context.checkpoint();
    const { featureSamples } = rasterizeRoadLayers(context, profiled);
    const distance = context.layers.get('roadDistance'), roadHeight = context.layers.get('roadHeight'), width = context.layers.get('roadWidth'), index = context.layers.get('roadIndex');
    const tanCut = Math.tan(params.cutSlopeDegrees * DEGREES), tanFill = Math.tan(params.fillSlopeDegrees * DEGREES), cellArea = grid.spacingX * grid.spacingZ;
    let carriageway = 0, cut = 0, fill = 0, unresolved = 0, cutVolume = 0, fillVolume = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (!constrained.has(index[i])) continue;
            const d = distance[i], half = width[i] / 2 + params.marginMeters, G = heights[i], H = roadHeight[i];
            let designed;
            if (d <= half) { designed = H; carriageway++; }
            else if (d <= half + params.shoulderWidthMeters) {
                const run = d - half;
                if (G < H) { designed = Math.max(G, H - run * tanFill); if (designed > G) fill++; }
                else { designed = Math.min(G, H + run * tanCut); if (designed < G) cut++; }
                if (run >= params.shoulderWidthMeters - DIAGONAL * Math.max(grid.spacingX, grid.spacingZ) && designed !== G) unresolved++;
            } else continue;
            const next = G + (mask ? mask[i] : 1) * (designed - G);
            if (next > G) fillVolume += (next - G) * cellArea; else cutVolume += (G - next) * cellArea;
            heights[i] = next;
        }
    }
    return { profileSource: params.profileSource, maxGradePercent: round6(worstGrade), maxGradeLimitPercent: params.maxGradePercent, infeasibleRoads: infeasible, network: { nodes: network.nodes, anchoredNodes: network.anchoredNodes, conflictNodes: network.conflictNodes, coupledStations: network.coupledStations, edges: network.edges, sweeps: network.sweeps }, roads: reports, featureSamples,
        carriagewaySamples: carriageway, cutSamples: cut, fillSamples: fill, unresolvedShoulderSamples: unresolved, cutVolumeCubicMeters: round6(cutVolume), fillVolumeCubicMeters: round6(fillVolume) };
}

async function constrainShoreline(context) {
    const { params } = context.operator, { grid, seaLevel } = context, { columns, rows } = grid, heights = context.layers.get('height'), shore = context.layers.get('shoreSigned'), mask = context.mask();
    const tangent = Math.tan(params.bandSlopeDegrees * DEGREES), tol = params.toleranceMeters, reach = tol + params.blendMeters;
    let raised = 0, lowered = 0, maxChange = 0, violations = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, s = shore[i], G = heights[i];
            const low = s >= -reach ? seaLevel + params.minLandHeightMeters - Math.max(0, tol - s) * tangent : -Infinity;
            const high = s <= reach ? seaLevel + params.maxSeaHeightMeters + Math.max(0, s + tol) * tangent : Infinity;
            const designed = Math.min(high, Math.max(low, G)), next = G + (mask ? mask[i] : 1) * (designed - G);
            if (next > G) raised++; else if (next < G) lowered++;
            if (Math.abs(next - G) > maxChange) maxChange = Math.abs(next - G);
            heights[i] = next;
            if ((s >= tol && next < seaLevel) || (s <= -tol && next >= seaLevel)) violations++;
        }
    }
    return { toleranceMeters: tol, raisedSamples: raised, loweredSamples: lowered, maxChangeMeters: round6(maxChange), crossingViolations: violations };
}

function blendTarget(context, heights, mask, weightAt, targetAt) {
    const { grid } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid;
    let touched = 0, maxChange = 0;
    for (let row = 0; row < rows; row++) {
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, x = minX + column * spacingX, w = weightAt(x, z, i);
            if (w <= 0) continue;
            const G = heights[i], next = G + w * (mask ? mask[i] : 1) * (targetAt(x, z, i) - G);
            if (next !== G) { touched++; if (Math.abs(next - G) > maxChange) maxChange = Math.abs(next - G); }
            heights[i] = next;
        }
    }
    return { samples: touched, maxChangeMeters: round6(maxChange) };
}

async function constrainPoints(context) {
    const { params } = context.operator, { grid, scope } = context, n = grid.columns * grid.rows, heights = context.layers.get('height'), shore = context.layers.get('shoreSigned'), mask = context.mask();
    let pads, footprints, corridor;
    if (params.source === 'plan') {
        if (!context.plan) throw new Error(`[Synthesis] operator ${context.operator.id}: source plan needs plan-inputs before it`);
        const points = context.plan.beachPoints.points;
        pads = points.filter(point => !point.footprintMeters).map(point => ({ name: point.name, x: point.x, z: point.z, height: point.y }));
        footprints = points.filter(point => point.footprintMeters).map(point => ({ name: point.name, x: point.x, z: point.z, height: point.y, extent: point.footprintMeters }));
        corridor = context.plan.beachPoints.corridor;
    } else {
        pads = [{ name: 'beach arrival', x: params.beachArrival[0], z: params.beachArrival[1], height: params.beachArrivalHeightMeters }];
        footprints = [{ name: 'bus stop', x: params.busStop[0], z: params.busStop[1], height: params.busStopHeightMeters, extent: params.busStopFootprintMeters }];
        corridor = params.corridorPolygon;
    }
    const statistics = { source: params.source, corridor: null, pads: {}, footprints: {} };
    if (params.corridor === 'descent' && corridor) {
        const sdf = scope.allocate('corridor-sdf', Float32Array, n), bearing = params.corridorBearingDegrees * DEGREES, dirX = Math.sin(bearing), dirZ = Math.cos(bearing);
        polygonSignedDistance(grid, corridor, sdf);
        const rise = params.corridorInlandHeightMeters - params.corridorSeaHeightMeters;
        statistics.corridor = blendTarget(context, heights, mask,
            (x, z, i) => (params.corridorBlendMeters > 0 ? 1 - smooth(0, params.corridorBlendMeters, -sdf[i]) : sdf[i] >= 0 ? 1 : 0) * (params.corridorShoreFadeMeters > 0 ? smooth(0, params.corridorShoreFadeMeters, shore[i]) : shore[i] >= 0 ? 1 : 0),
            (x, z) => params.corridorSeaHeightMeters + Math.min(1, Math.max(0, ((x - params.corridorOrigin[0]) * dirX + (z - params.corridorOrigin[1]) * dirZ) / params.corridorRunMeters)) * rise);
        scope.free('corridor-sdf');
    }
    context.checkpoint();
    for (const pad of pads) {
        statistics.pads[pad.name] = { heightMeters: pad.height, ...blendTarget(context, heights, mask,
            (x, z) => { const d = Math.hypot(x - pad.x, z - pad.z); return d <= params.padRadiusMeters ? 1 : params.padBlendMeters > 0 ? 1 - smooth(params.padRadiusMeters, params.padRadiusMeters + params.padBlendMeters, d) : 0; },
            () => pad.height) };
    }
    for (const footprint of footprints) {
        statistics.footprints[footprint.name] = { heightMeters: footprint.height, extentMeters: footprint.extent, ...blendTarget(context, heights, mask,
            (x, z) => { const outside = Math.hypot(Math.max(0, Math.abs(x - footprint.x) - footprint.extent[0] / 2), Math.max(0, Math.abs(z - footprint.z) - footprint.extent[1] / 2)); return outside <= 0 ? 1 : params.busStopBlendMeters > 0 ? 1 - smooth(0, params.busStopBlendMeters, outside) : 0; },
            () => footprint.height) };
    }
    return statistics;
}

async function constrainRunway(context) {
    const { params } = context.operator, { grid, scope } = context, n = grid.columns * grid.rows, heights = context.layers.get('height'), mask = context.mask();
    const polygon = context.plan?.geometry.runway;
    if (!polygon) throw new Error(`[Synthesis] operator ${context.operator.id}: constrain-runway needs plan-inputs with a runwayPolygon before it`);
    const sdf = scope.allocate('runway-sdf', Float32Array, n), [cx, cz] = polygonCentroid(polygon), bearing = params.gradeBearingDegrees * DEGREES, dirX = Math.sin(bearing), dirZ = Math.cos(bearing);
    polygonSignedDistance(grid, polygon, sdf);
    const statistics = blendTarget(context, heights, mask, (x, z, i) => params.blendMeters > 0 ? 1 - smooth(0, params.blendMeters, -sdf[i]) : sdf[i] >= 0 ? 1 : 0,
        (x, z) => params.heightMeters + params.gradePercent / 100 * ((x - cx) * dirX + (z - cz) * dirZ));
    scope.free('runway-sdf');
    return { heightMeters: params.heightMeters, gradePercent: params.gradePercent, centroid: [round6(cx), round6(cz)], ...statistics };
}

async function heightCap(context) {
    const { params } = context.operator, heights = context.layers.get('height'), mask = context.mask(), cap = params.capMeters, shoulder = params.shoulderMeters, knee = cap - shoulder;
    let capped = 0, maxChange = 0;
    for (let i = 0; i < heights.length; i++) {
        const G = heights[i];
        if (G <= knee) continue;
        const designed = shoulder > 0 ? knee + shoulder * ((G - knee) / shoulder) / (1 + (G - knee) / shoulder) : cap;
        const next = G + (mask ? mask[i] : 1) * (designed - G);
        if (next !== G) { capped++; if (G - next > maxChange) maxChange = G - next; }
        heights[i] = next;
    }
    return { capMeters: cap, shoulderMeters: shoulder, cappedSamples: capped, maxLowerMeters: round6(maxChange) };
}

export const CONSTRAINT_OPERATORS = Object.freeze({ 'constrain-districts': constrainDistricts, 'constrain-roads': constrainRoads, 'constrain-shoreline': constrainShoreline, 'constrain-points': constrainPoints, 'constrain-runway': constrainRunway, 'height-cap': heightCap });
