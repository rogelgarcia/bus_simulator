// Implements the landform operators: landform-plateau (target with a designed edge), landform-hills (ridged relief) and landform-valley (carved channel).
// @ts-check
// Every landform is evaluated from world positions only (plateau and valley from exact distances to their geometry, hills from
// world-anchored noise at the sample position), so a window of the grid with a halo reproduces the global result bit for bit inside
// the window. The operator mask scales each change: h += mask * (designed - h).
import { createLandscapeNoiseOctaves, createLandscapeSurfaceWarp } from '../../../../src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { createPolylineSet, exactDistanceTransform, rasterizePolylineSet, refineNearestSegments } from './Distance.mjs';
import { createEdgeProfile } from './EdgeProfiles.mjs';
import { polygonCentroid, polygonSignedDistance } from './Polygons.mjs';

const DEGREES = Math.PI / 180;
const round6 = value => Math.round(value * 1e6) / 1e6;

/** Bilinear height at a world position, edges clamped. @param {any} grid @param {Float32Array} heights @param {number} x @param {number} z */
export function sampleHeight(grid, heights, x, z) {
    const { columns, rows, spacingX, spacingZ, minX, maxZ } = grid;
    const gx = Math.min(columns - 1, Math.max(0, (x - minX) / spacingX)), gz = Math.min(rows - 1, Math.max(0, (maxZ - z) / spacingZ));
    const cx = Math.min(columns - 2, Math.floor(gx)), rz = Math.min(rows - 2, Math.floor(gz)), fx = gx - cx, fz = gz - rz;
    const a = heights[rz * columns + cx], b = heights[rz * columns + cx + 1], c = heights[(rz + 1) * columns + cx], d = heights[(rz + 1) * columns + cx + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/** Resolves the plateau polygon and base target of a district id or explicit polygon. @param {any} context @param {{districtId:number|null,polygon:number[][]|null,heightMeters:number|null}} params */
export function resolvePlateauTarget(context, params) {
    if (params.districtId !== null) {
        if (!context.plan) throw new Error(`[Synthesis] operator ${context.operator.id}: districtId ${params.districtId} needs plan-inputs before it`);
        const district = context.plan.districts.find(entry => entry.id === params.districtId);
        if (!district) throw new Error(`[Synthesis] operator ${context.operator.id}: district ${params.districtId} is not in the plan (ids ${context.plan.districts.map(entry => entry.id).join(', ')})`);
        return { polygon: district.polygon, heightMeters: params.heightMeters ?? district.targetMeters, name: district.name };
    }
    return { polygon: params.polygon, heightMeters: params.heightMeters, name: 'polygon' };
}

/**
 * Applies a target surface inside a polygon and the designed edge outside it, scaled by the mask. Shared with constrain-districts.
 * The edge's base follows params.baseMode along the outward normal from each sample's nearest boundary point, on the pre-operator
 * ground: daylight marches the descent until it meets the ground (within daylightReachMeters, else the run ends there and the sample
 * is counted undaylighted); probe takes the ground at baseProbeMeters and hands over to min(ground, base) up to that distance, so an
 * old feather above the base is removed; sample-ground takes the ground under the sample; explicit takes baseHeightMeters.
 * @param {any} context @param {{polygon:number[][],heightMeters:number,tiltEastMetersPerKm:number,tiltNorthMetersPerKm:number}} target
 * @param {{baseMode:string,daylightReachMeters:number,baseProbeMeters:number,baseHeightMeters:number|null,blendMeters:number}} params
 * @param {ReturnType<typeof createEdgeProfile>} profile @param {(T:number,G:number)=>number} inside height inside the polygon from target and ground
 */
export function applyPlateau(context, target, params, profile, inside) {
    const { grid, scope } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, heights = context.layers.get('height'), mask = context.mask();
    const mode = params.baseMode, keep = target.keep === true, marching = mode === 'daylight' || mode === 'probe' || mode === 'extrapolate', normals = marching || keep;
    const sdf = scope.allocate('plateau-sdf', Float32Array, n), scratch = new Float64Array(3), [cx, cz] = polygonCentroid(target.polygon);
    const nearestX = normals ? scope.allocate('plateau-nearest-x', Float32Array, n) : null, nearestZ = normals ? scope.allocate('plateau-nearest-z', Float32Array, n) : null;
    const ground = normals ? scope.allocate('plateau-ground', Float32Array, n) : null, step = Math.max(.5, Math.min(spacingX, spacingZ) / 2);
    if (ground) ground.set(heights);
    polygonSignedDistance(grid, target.polygon, sdf, nearestX, nearestZ);
    let insideSamples = 0, raised = 0, lowered = 0, maxRaise = 0, maxLower = 0, undaylighted = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, x = minX + column * spacingX, d = -sdf[i], G = heights[i];
            const T = keep ? (d <= 0 ? G : sampleHeight(grid, ground, nearestX[i], nearestZ[i]))
                : target.heightMeters + target.tiltEastMetersPerKm * (x - cx) / 1000 + target.tiltNorthMetersPerKm * (z - cz) / 1000;
            let designed;
            if (d <= 0) { designed = inside(T, G); insideSamples++; }
            else {
                let B, toe, beyond = G;
                if (marching) {
                    const qx = nearestX[i], qz = nearestZ[i], nx = (x - qx) / d, nz = (z - qz) / d, groundAt = s => sampleHeight(grid, ground, qx + nx * s, qz + nz * s);
                    if (mode === 'probe') {
                        B = groundAt(params.baseProbeMeters); toe = profile.geometry(T, B, scratch)[0];
                        if (d <= params.baseProbeMeters && G > B) beyond = B;
                    } else if (mode === 'extrapolate') {
                        // the natural ground under an old feather: the slope measured beyond the probe distance, continued back toward the boundary
                        const p = params.baseProbeMeters, far = groundAt(p), slope = (far - groundAt(p + params.extrapolationMeters)) / params.extrapolationMeters;
                        const baseAt = s => s <= p ? far + slope * (p - s) : groundAt(s);
                        if (!profile.marching) { toe = profile.geometry(T, 0, scratch)[0]; B = baseAt(toe); }
                        else {
                            toe = profile.daylight(T, baseAt, params.daylightReachMeters, step);
                            if (toe === Infinity) { undaylighted++; toe = params.daylightReachMeters; }
                            B = profile.descent(toe, T);
                        }
                        if (d <= p) beyond = Math.min(G, baseAt(d));
                    } else if (!profile.marching) { toe = profile.geometry(T, G, scratch)[0]; B = groundAt(toe); }
                    // beyond the daylight reach no run can arrive: the sample keeps its ground (max and replace gave the ground here already; blend
                    // used to mix the ground with the descent at the reach inside the blend band, a ring lowered by half the descent around every pad)
                    else if (d > params.daylightReachMeters) continue;
                    else {
                        toe = profile.daylight(T, groundAt, params.daylightReachMeters, step);
                        if (toe === Infinity) { undaylighted++; toe = params.daylightReachMeters; }
                        B = profile.descent(toe, T);
                    }
                } else { B = mode === 'explicit' ? params.baseHeightMeters : G; toe = profile.geometry(T, B, scratch)[0]; }
                designed = profile.compose(d, T, G, B, toe, beyond, scratch);
            }
            const next = G + (mask ? mask[i] : 1) * (designed - G), change = next - G;
            if (change > 0) { raised++; if (change > maxRaise) maxRaise = change; } else if (change < 0) { lowered++; if (-change > maxLower) maxLower = -change; }
            heights[i] = next;
        }
    }
    scope.free('plateau-sdf');
    if (normals) scope.free('plateau-nearest-x', 'plateau-nearest-z', 'plateau-ground');
    return { baseMode: mode, insideSamples, raisedSamples: raised, loweredSamples: lowered, maxRaiseMeters: round6(maxRaise), maxLowerMeters: round6(maxLower), undaylightedSamples: undaylighted, centroid: [round6(cx), round6(cz)] };
}

async function landformPlateau(context) {
    const { params } = context.operator, target = resolvePlateauTarget(context, params), profile = createEdgeProfile(params), keep = params.insideMode === 'keep';
    const statistics = applyPlateau(context, { ...target, keep, tiltEastMetersPerKm: params.tiltEastMetersPerKm, tiltNorthMetersPerKm: params.tiltNorthMetersPerKm }, params, profile, keep ? (T, G) => G : T => T);
    return { target: target.name, heightMeters: keep ? null : target.heightMeters, insideMode: params.insideMode, profile: params.profile, combine: params.combine, ...statistics };
}

/** Relief sampler of landform-hills in world meters (shared with the halo test): bounded ridged octaves after warp and anisotropy. @param {number} seed @param {any} params */
export function createHillsRelief(seed, params) {
    const octaves = createLandscapeNoiseOctaves({ seed, component: 0, wavelengths: [...params.wavelengthsMeters], amplitudes: [...params.amplitudes], shaping: params.ridgedMix > 0 ? 'ridged-mix' : 'none', ridgedMix: params.ridgedMix });
    const warp = params.warpMeters > 0 ? createLandscapeSurfaceWarp({ seed, wavelengths: [params.warpWavelengthMeters, params.warpWavelengthMeters / 2.5], amplitudes: [.75 * params.warpMeters, .25 * params.warpMeters] }) : null;
    const bearing = params.bearingDegrees * DEGREES, sinB = Math.sin(bearing), cosB = Math.cos(bearing), stretch = 1 / params.anisotropy, normalization = octaves.amplitude || 1, displacement = new Float64Array(2);
    return (x, z) => {
        let px = x, pz = z;
        if (warp) { warp.evaluate(x, z, displacement); px += displacement[0]; pz += displacement[1]; }
        const along = px * sinB + pz * cosB, across = px * cosB - pz * sinB, r = octaves.evaluate(across, along * stretch) / normalization;
        return params.offset === 'positive' ? params.amplitudeMeters * (r + 1) / 2 : params.amplitudeMeters * r;
    };
}

async function landformHills(context) {
    const { params, seed } = context.operator, { grid, seaLevel } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, heights = context.layers.get('height'), mask = context.mask();
    const relief = createHillsRelief(seed, params);
    let minimum = Infinity, maximum = -Infinity, changed = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, x = minX + column * spacingX, value = relief(x, z), G = heights[i];
            const designed = params.combine === 'add' ? G + value : Math.max(G, seaLevel + value);
            const next = G + (mask ? mask[i] : 1) * (designed - G);
            if (next !== G) changed++;
            heights[i] = next;
            if (value < minimum) minimum = value; if (value > maximum) maximum = value;
        }
    }
    return { seed, combine: params.combine, changedSamples: changed, reliefRangeMeters: [round6(minimum), round6(maximum)] };
}

async function landformValley(context) {
    const { params } = context.operator, { grid, scope, memory } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, heights = context.layers.get('height'), mask = context.mask();
    const set = createPolylineSet([params.polyline]), station = new Float64Array(set.count + 1);
    for (let k = 0; k < set.count; k++) station[k + 1] = station[k] + Math.hypot(set.bx[k] - set.ax[k], set.bz[k] - set.az[k]);
    const length = station[set.count], feature = scope.allocate('valley-feature', Uint8Array, n), featureSegment = scope.allocate('valley-feature-segment', Int32Array, n);
    if (!rasterizePolylineSet(grid, set, feature, featureSegment)) throw new Error(`[Synthesis] operator ${context.operator.id}: the valley axis does not cross the working grid`);
    const edt = exactDistanceTransform(grid, feature, memory, `op/${context.operator.id}/valley`);
    const distance = scope.allocate('valley-distance', Float32Array, n), segment = scope.allocate('valley-segment', Int32Array, n), parameter = scope.allocate('valley-parameter', Float32Array, n);
    refineNearestSegments(grid, set, edt.nearest, featureSegment, distance, segment, parameter);
    edt.release();
    // axis heights are read from a copy so carving never feeds back into the axis reference
    const reference = scope.allocate('valley-reference', Float32Array, n); reference.set(heights);
    const half = params.widthMeters / 2;
    let carved = 0, deepest = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, d = distance[i];
            if (d >= half) continue;
            const k = segment[i], t = parameter[i], s = station[k] + t * (station[k + 1] - station[k]);
            const taper = params.endTaperMeters > 0 ? Math.min(1, s / params.endTaperMeters, (length - s) / params.endTaperMeters) : 1;
            const axisHeight = sampleHeight(grid, reference, set.ax[k] + (set.bx[k] - set.ax[k]) * t, set.az[k] + (set.bz[k] - set.az[k]) * t);
            const shape = params.profile === 'parabolic' ? 1 - (d / half) * (d / half) : 1 - d / half, depth = params.depthMeters * Math.max(0, taper) * shape;
            const G = heights[i], designed = Math.min(G, axisHeight - depth), next = G + (mask ? mask[i] : 1) * (designed - G);
            if (next < G) { carved++; if (G - next > deepest) deepest = G - next; }
            heights[i] = next;
        }
    }
    scope.free('valley-feature', 'valley-feature-segment', 'valley-distance', 'valley-segment', 'valley-parameter', 'valley-reference');
    return { axisLengthMeters: round6(length), carvedSamples: carved, deepestCutMeters: round6(deepest) };
}

export const LANDFORM_OPERATORS = Object.freeze({ 'landform-plateau': landformPlateau, 'landform-hills': landformHills, 'landform-valley': landformValley });
