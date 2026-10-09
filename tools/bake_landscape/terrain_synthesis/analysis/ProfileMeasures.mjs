// Measures beach transects, plateau edge profiles, the angle a target plateau subtends from observers and the A-B road route profile.
// @ts-check
// Profiles sample the height field bilinearly at fixed stations; the along-profile slope is the central difference in degrees (positive
// = rising along the profile direction). A beach transect runs shore-normal at constant Z from the sea onto the land: the sea-level
// crossing is the first linear up-crossing of sea level, the sand width is the contiguous run of cover 1 landward of it, the foreshore
// slope is measured between the crossing and the +1 m crossing, the berm is the first local maximum within 60 m, and the first rise
// above 3 m reports its local slope and the mean slope over the following 20 m. Subtended angles are elevation angles atan(dh / d) from
// the observer's eye to samples of the target polygon rim inside the heading cone; the foreground horizon is the maximum elevation angle of
// the ground between the observer and the farthest rim sample, so the plateau reads above the horizon only when its angle exceeds it.
import { assertSynthesisGrid, pointInPolygon, polylinePath, profileSlopeDegrees, sampleBilinear, sampleNearest } from './GridSampling.mjs';

const DEGREES = 180 / Math.PI;
const BERM_SEARCH_METERS = 60, RISE_METERS = 3, RISE_SLOPE_RUN_METERS = 20, FORESHORE_RISE_METERS = 1;

/** Linear crossing position between two consecutive stations straddling `level`. */
const crossingAt = (positions, heights, i, level) => positions[i - 1] + (positions[i] - positions[i - 1]) * (level - heights[i - 1]) / (heights[i] - heights[i - 1]);

/**
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {Uint8Array} cover @param {number} seaLevel
 * @param {{transects:{id:string,z:number,xStart:number,xEnd:number,stepMeters?:number}[]}} options
 */
export function beachProfiles(grid, heights, cover, seaLevel, { transects }) {
    assertSynthesisGrid(grid, heights, cover);
    if (!Number.isFinite(seaLevel)) throw new Error('[SynthesisAnalysis] seaLevel must be finite');
    if (!Array.isArray(transects) || !transects.length) throw new Error('[SynthesisAnalysis] beachProfiles needs at least one transect');
    return { method: 'constant-Z transects sampled bilinearly; crossing = first linear up-crossing of sea level; slopes in degrees', seaLevel, transects: transects.map(transect => {
        const { id, z, xStart, xEnd, stepMeters = 1 } = transect;
        if (typeof id !== 'string' || ![z, xStart, xEnd].every(Number.isFinite) || xEnd === xStart || !(stepMeters > 0)) throw new Error(`[SynthesisAnalysis] Invalid transect ${id}`);
        const direction = Math.sign(xEnd - xStart), count = Math.floor(Math.abs(xEnd - xStart) / stepMeters) + 1;
        const x = new Array(count), height = new Array(count), coverClass = new Array(count);
        for (let i = 0; i < count; i++) { x[i] = xStart + direction * i * stepMeters; height[i] = sampleBilinear(grid, heights, x[i], z); coverClass[i] = sampleNearest(grid, cover, x[i], z); }
        const distance = x.map(value => Math.abs(value - xStart)), slope = profileSlopeDegrees(distance, height);
        let crossingIndex = -1;
        for (let i = 1; i < count; i++) if (height[i - 1] < seaLevel && height[i] >= seaLevel) { crossingIndex = i; break; }
        let maxHeight = -Infinity, maxX = null;
        for (let i = 0; i < count; i++) if (height[i] > maxHeight) { maxHeight = height[i]; maxX = x[i]; }
        const result = { id, z, xStart, xEnd, stepMeters, stations: { x, height, cover: coverClass, slopeDegrees: slope }, crossingX: null, sandWidthMeters: null, foreshoreSlopeDegrees: null,
            foreshoreRiseX: null, berm: null, riseAbove3m: null, plateauHeight: height[count - 1], maxHeight, maxHeightX: maxX };
        if (crossingIndex < 0) return result;
        const crossingX = crossingAt(x, height, crossingIndex, seaLevel);
        result.crossingX = crossingX;
        // sand runs from the crossing (water-classed wet-sand stations at the shoreline count) to the boundary between the last sand station
        // and the first other station, or to the transect end
        let sandStart = crossingIndex;
        while (sandStart < count && coverClass[sandStart] === 0) sandStart++;
        let sandEnd = sandStart;
        while (sandEnd < count && coverClass[sandEnd] === 1) sandEnd++;
        result.sandWidthMeters = sandEnd === sandStart ? 0 : sandEnd < count ? Math.abs(x[sandEnd] - crossingX) - stepMeters / 2 : Math.abs(x[count - 1] - crossingX);
        result.sandReachesTransectEnd = sandEnd === count && sandEnd > sandStart;
        for (let i = crossingIndex; i < count; i++) if (height[i] >= seaLevel + FORESHORE_RISE_METERS) {
            const riseX = i > 0 && height[i - 1] < seaLevel + FORESHORE_RISE_METERS ? crossingAt(x, height, i, seaLevel + FORESHORE_RISE_METERS) : x[i];
            const run = Math.abs(riseX - crossingX);
            result.foreshoreRiseX = riseX; result.foreshoreSlopeDegrees = run > 0 ? Math.atan(FORESHORE_RISE_METERS / run) * DEGREES : 90;
            break;
        }
        for (let i = crossingIndex + 1; i < count - 1 && Math.abs(x[i] - crossingX) <= BERM_SEARCH_METERS; i++) {
            if (height[i] > height[i - 1] && height[i] >= height[i + 1] && height[i] > seaLevel) { result.berm = { x: x[i], height: height[i], distanceFromCrossing: Math.abs(x[i] - crossingX) }; break; }
        }
        for (let i = crossingIndex; i < count; i++) if (height[i] >= seaLevel + RISE_METERS) {
            const riseX = i > 0 && height[i - 1] < seaLevel + RISE_METERS ? crossingAt(x, height, i, seaLevel + RISE_METERS) : x[i];
            const ahead = sampleBilinear(grid, heights, riseX + direction * RISE_SLOPE_RUN_METERS, z), here = sampleBilinear(grid, heights, riseX, z);
            result.riseAbove3m = { x: riseX, distanceFromCrossing: Math.abs(riseX - crossingX), localSlopeDegrees: slope[i], slopeDegreesNext20m: Math.atan((ahead - here) / RISE_SLOPE_RUN_METERS) * DEGREES };
            break;
        }
        return result;
    }) };
}

/**
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights
 * @param {{profiles:{id:string,from:number[],to:number[],stepMeters?:number}[]}} options
 */
export function edgeProfiles(grid, heights, { profiles }) {
    assertSynthesisGrid(grid, heights);
    if (!Array.isArray(profiles) || !profiles.length) throw new Error('[SynthesisAnalysis] edgeProfiles needs at least one profile');
    return { method: 'straight segments sampled bilinearly at fixed stations; slope = central difference in degrees, positive rising along the segment', profiles: profiles.map(profile => {
        const { id, from, to, stepMeters = 2 } = profile;
        if (typeof id !== 'string' || !Array.isArray(from) || !Array.isArray(to) || ![...from, ...to].every(Number.isFinite) || !(stepMeters > 0)) throw new Error(`[SynthesisAnalysis] Invalid edge profile ${id}`);
        const path = polylinePath([from, to], `profile ${id}`), stations = path.stations(stepMeters), count = stations.distance.length;
        const distance = Array.from(stations.distance), height = new Array(count);
        for (let i = 0; i < count; i++) height[i] = sampleBilinear(grid, heights, stations.x[i], stations.z[i]);
        const slope = profileSlopeDegrees(distance, height);
        let steepestIndex = 0;
        for (let i = 1; i < count; i++) if (Math.abs(slope[i]) > Math.abs(slope[steepestIndex])) steepestIndex = i;
        let minHeight = Infinity, maxHeight = -Infinity;
        for (const value of height) { minHeight = Math.min(minHeight, value); maxHeight = Math.max(maxHeight, value); }
        return { id, from: [...from], to: [...to], stepMeters, lengthMeters: path.length, distance, height, slopeDegrees: slope, startHeight: height[0], endHeight: height[count - 1],
            dropMeters: height[0] - height[count - 1], minHeight, maxHeight, steepest: { slopeDegrees: slope[steepestIndex], distance: distance[steepestIndex], height: height[steepestIndex] },
            meanSlopeDegrees: Math.atan((height[count - 1] - height[0]) / path.length) * DEGREES };
    }) };
}

const bearingDegrees = (dx, dz) => (Math.atan2(dx, dz) * DEGREES + 360) % 360;
const angularDifference = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };

/**
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights
 * @param {{observers:{id:string,x:number,z:number,eyeHeightMeters:number,headingDegrees:number,halfAngleDegrees:number}[],targetPolygon:number[][],rimStepMeters?:number}} options
 */
export function subtendedAngles(grid, heights, { observers, targetPolygon, rimStepMeters }) {
    assertSynthesisGrid(grid, heights);
    if (!Array.isArray(observers) || !observers.length) throw new Error('[SynthesisAnalysis] subtendedAngles needs at least one observer');
    if (!Array.isArray(targetPolygon) || targetPolygon.length < 3) throw new Error('[SynthesisAnalysis] subtendedAngles needs a target polygon');
    const step = rimStepMeters ?? grid.spacingX, rim = [];
    for (let i = 0; i < targetPolygon.length; i++) {
        const a = targetPolygon[i], b = targetPolygon[(i + 1) % targetPolygon.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.max(1, Math.ceil(length / step));
        for (let k = 0; k < count; k++) { const t = k / count; rim.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return { method: 'elevation angle atan((h - eye) / horizontal distance) over target rim samples inside the heading cone; foreground horizon = max elevation angle of the ground on the line to the farthest rim sample before entering the polygon',
        rimSamples: rim.length, rimStepMeters: step, observers: observers.map(observer => {
            const { id, x, z, eyeHeightMeters, headingDegrees, halfAngleDegrees } = observer;
            if (typeof id !== 'string' || ![x, z, eyeHeightMeters, headingDegrees, halfAngleDegrees].every(Number.isFinite)) throw new Error(`[SynthesisAnalysis] Invalid observer ${id}`);
            const ground = sampleBilinear(grid, heights, x, z), eye = ground + eyeHeightMeters;
            let best = null, farthest = null, inCone = 0;
            for (const [rx, rz] of rim) {
                const dx = rx - x, dz = rz - z, distance = Math.hypot(dx, dz);
                if (distance < 1e-6 || angularDifference(bearingDegrees(dx, dz), headingDegrees) > halfAngleDegrees) continue;
                inCone++;
                const height = sampleBilinear(grid, heights, rx, rz), elevation = Math.atan((height - eye) / distance) * DEGREES;
                if (!best || elevation > best.elevationDegrees) best = { x: rx, z: rz, height, distance, elevationDegrees: elevation, bearingDegrees: bearingDegrees(dx, dz) };
                if (!farthest || distance > farthest.distance) farthest = { x: rx, z: rz, distance };
            }
            const result = { id, x, z, eyeHeightMeters, headingDegrees, halfAngleDegrees, groundHeight: ground, eyeHeight: eye, rimSamplesInCone: inCone, maxElevationDegrees: null, at: null,
                foregroundHorizonDegrees: null, foregroundHorizonAt: null, aboveHorizonDegrees: null, farthestRim: farthest };
            if (!best) return result;
            result.maxElevationDegrees = best.elevationDegrees; result.at = best;
            // the foreground stops one grid spacing before the rim so the interpolation ramp onto the target is not counted as foreground
            const dx = farthest.x - x, dz = farthest.z - z, count = Math.max(1, Math.ceil(farthest.distance / (step / 2))), ux = dx / farthest.distance * grid.spacingX, uz = dz / farthest.distance * grid.spacingZ;
            let horizon = -90, horizonAt = null;
            for (let k = 1; k < count; k++) {
                const t = k / count, px = x + dx * t, pz = z + dz * t;
                if (pointInPolygon(targetPolygon, px, pz) || pointInPolygon(targetPolygon, px + ux, pz + uz)) break;
                const distance = farthest.distance * t, height = sampleBilinear(grid, heights, px, pz), elevation = Math.atan((height - eye) / distance) * DEGREES;
                if (elevation > horizon) { horizon = elevation; horizonAt = { x: px, z: pz, height, distance }; }
            }
            result.foregroundHorizonDegrees = horizon; result.foregroundHorizonAt = horizonAt; result.aboveHorizonDegrees = best.elevationDegrees - horizon;
            return result;
        }) };
}

export const COASTAL_ROUTE_AB = Object.freeze([
    { name: 'Open beach descent', reverse: true }, { name: 'Beach approach upper', reverse: true }, { name: 'Coastal residential road', reverse: true },
    { name: 'Homes north access', reverse: true }, { name: 'Cross-town west', reverse: false }, { name: 'Cross-town east', reverse: false }, { name: 'High-city south ascent', reverse: false }
].map(Object.freeze));

/**
 * Concatenated road centerlines (roads.json) resampled at 2 m stations with grades over 20 m and 50 m windows.
 * @param {import('./GridSampling.mjs').SynthesisGrid} grid @param {Float32Array} heights @param {{roads:{name:string,centerline_xyz_m:number[][]}[]}} roads
 * @param {{route?:ReadonlyArray<{name:string,reverse:boolean}>,stepMeters?:number,windowsMeters?:number[]}} [options]
 */
export function routeProfile(grid, heights, roads, options = {}) {
    assertSynthesisGrid(grid, heights);
    const { route = COASTAL_ROUTE_AB, stepMeters = 2, windowsMeters = [20, 50] } = options;
    if (!roads || !Array.isArray(roads.roads)) throw new Error('[SynthesisAnalysis] routeProfile needs the parsed roads.json');
    const points = [], parts = [];
    let partStart = 0;
    for (const { name, reverse } of route) {
        const road = roads.roads.find(entry => entry.name === name);
        if (!road) throw new Error(`[SynthesisAnalysis] Route road ${name} is not in roads.json`);
        const xz = road.centerline_xyz_m.map(point => [point[0], point[2]]);
        if (reverse) xz.reverse();
        points.push(...xz);
        parts.push({ name, reverse, firstVertex: partStart }); partStart = points.length;
    }
    const path = polylinePath(points, 'route'), stations = path.stations(stepMeters), count = stations.distance.length;
    const rawCumulative = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) rawCumulative[i] = rawCumulative[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    const distance = Array.from(stations.distance), x = Array.from(stations.x), z = Array.from(stations.z), height = new Array(count);
    for (let i = 0; i < count; i++) height[i] = sampleBilinear(grid, heights, x[i], z[i]);
    let climb = 0, descent = 0, minHeight = Infinity, maxHeight = -Infinity;
    for (let i = 0; i < count; i++) {
        minHeight = Math.min(minHeight, height[i]); maxHeight = Math.max(maxHeight, height[i]);
        if (i) { const delta = height[i] - height[i - 1]; if (delta > 0) climb += delta; else descent -= delta; }
    }
    const windows = windowsMeters.map(meters => {
        let maxGrade = 0, at = 0;
        for (let i = 0; i < count; i++) {
            if (distance[i] + meters > path.length + 1e-9) break;
            const end = path.pointAt(distance[i] + meters), grade = Math.abs(sampleBilinear(grid, heights, end.x, end.z) - height[i]) / meters * 100;
            if (grade > maxGrade) { maxGrade = grade; at = distance[i]; }
        }
        return { meters, maxGradePercent: maxGrade, atDistance: at };
    });
    const partDistances = parts.map(part => ({ name: part.name, reverse: part.reverse, startDistance: rawCumulative[part.firstVertex] }));
    return { method: 'concatenated roads.json centerlines, 2 m stations, bilinear heights; window grade = |h(s + W) - h(s)| / W', stepMeters, lengthMeters: path.length, stations: { distance, x, z, height },
        totalClimbMeters: climb, totalDescentMeters: descent, minHeight, maxHeight, startHeight: height[0], endHeight: height[count - 1], windows, parts: partDistances };
}
