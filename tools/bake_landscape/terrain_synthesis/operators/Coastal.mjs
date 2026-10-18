// Implements the coastal operators: headland and cove landforms, wave exposure, bluff retreat with a wave-cut platform, the equilibrium beach profile, foredunes, the nearshore bar and rocky reefs.
// @ts-check
// Every coastal operator works in shoreline coordinates: the signed distance to the design shoreline (shoreSigned, land positive)
// and the landward normal read from its gradient, so profiles are imposed as functions of that distance and the sea-level crossing
// lands on the design line. The beach is the Dean 1991 equilibrium profile h = A x^(2/3) seaward of a straight Bosboom & Stive
// foreshore (the Dean origin is shifted so the two meet at the swash depth), the berm and a descending backshore; the bluff is a
// cut-only face at the declared slope from a crest moved landward by the retreat down to a wave-cut platform with a talus wedge
// sized from the cut volume; the foredune, bar and reef are additive relief placed from the same coordinates. Exposure casts rays over
// the current surface from every waterline sample across the seaward fan and carries the open-fetch fraction along the nearest
// waterline sample. Each operator moves the surface through the geology ledger (height === bedrock + regolith + depositThickness) and
// reports how far it moved the sea-level crossing from the design shoreline, so recipes keep constrain-shoreline's tolerance; the
// headland and cove move it deliberately and report the affected design-shoreline vertices. Plan protection zeroes the change inside
// districts, around the plan beach points, inside the open-view corridor and inside the southwest swim zone where an operator asks.
import { createLandscapeNoiseOctaves } from '../../../../src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { smoothstep } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { swimZonePolygon } from '../analysis/ConstraintReport.mjs';
import { exactDistanceTransform } from './Distance.mjs';
import { sampleHeight } from './Landforms.mjs';
import { polygonSignedDistance, rasterizePolygon } from './Polygons.mjs';
import { geologyLedger } from './Strata.mjs';

const DEGREES = Math.PI / 180, PROTECT_BLEND_METERS = 10, STATION_BAND = .75;
export const COASTAL_ZONE = Object.freeze({ inland: 0, offshore: 1, reef: 2, bar: 3, surf: 4, swash: 5, berm: 6, backshore: 7, foredune: 8, platform: 9, bluffToe: 10, bluffFace: 11, bluffCrown: 12 });
export const COASTAL_DEPOSIT = Object.freeze({ none: 0, talus: 1, beachSand: 4, duneSand: 5, reefRock: 6 });
const round6 = value => Math.round(value * 1e6) / 1e6;
const clamp01 = value => value < 0 ? 0 : value > 1 ? 1 : value;
const hump = r => Math.abs(r) < 1 ? .5 * (1 + Math.cos(Math.PI * r)) : 0;

function nearestIndex(grid, x, z) {
    const column = Math.min(grid.columns - 1, Math.max(0, Math.round((x - grid.minX) / grid.spacingX))), row = Math.min(grid.rows - 1, Math.max(0, Math.round((grid.maxZ - z) / grid.spacingZ)));
    return row * grid.columns + column;
}

// unit landward normal of the design shoreline at a sample (gradient of the signed distance, one-sided at the grid edge); false where degenerate
function landwardNormal(grid, shore, row, column, out) {
    const { columns, rows, spacingX, spacingZ } = grid, west = Math.max(0, column - 1), east = Math.min(columns - 1, column + 1), north = Math.max(0, row - 1), south = Math.min(rows - 1, row + 1);
    const gx = (shore[row * columns + east] - shore[row * columns + west]) / ((east - west) * spacingX), gz = (shore[north * columns + column] - shore[south * columns + column]) / ((south - north) * spacingZ);
    const length = Math.hypot(gx, gz);
    if (length < 1e-9) { out[0] = 0; out[1] = 0; return false; }
    out[0] = gx / length; out[1] = gz / length;
    return true;
}

function noiseField(seed, component, wavelengths, amplitudes, shaping = 'none', ridgedMix = 0) {
    const octaves = createLandscapeNoiseOctaves({ seed, component, wavelengths: [...wavelengths], amplitudes: [...amplitudes], shaping, ridgedMix }), scale = 1 / (octaves.amplitude || 1);
    return (x, z) => octaves.evaluate(x, z) * scale;
}

function ensureLayer(context, name, Type, created) {
    if (context.layers.has(name)) return context.layers.get(name);
    created.push(name);
    return context.layers.create(name, Type);
}

function snapshot(context, name) {
    const heights = context.layers.get('height'), copy = context.scope.allocate(name, Float32Array, heights.length);
    copy.set(heights);
    return copy;
}

/**
 * Sea-level crossing bookkeeping of one operator: the samples whose land/sea status flipped (and how far from the design shoreline
 * the farthest flip lies) and the largest deviation of the waterline from the design shoreline before and after on the rows it touched.
 * @param {any} context @param {Float32Array} before heights before the operator
 */
export function shorelineReport(context, before) {
    const { grid, seaLevel } = context, { columns, rows } = grid, heights = context.layers.get('height'), shore = context.layers.get('shoreSigned');
    const deviation = (values, a, b) => {
        if ((values[a] >= seaLevel) === (values[b] >= seaLevel)) return 0;
        const t = (seaLevel - values[a]) / (values[b] - values[a]);
        return Math.abs(shore[a] + (shore[b] - shore[a]) * t);
    };
    let flipped = 0, maxFlip = 0, changedRows = 0, after = 0, prior = 0;
    for (let row = 0; row < rows; row++) {
        let changed = false;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (heights[i] !== before[i]) changed = true;
            if ((before[i] >= seaLevel) !== (heights[i] >= seaLevel)) { flipped++; if (Math.abs(shore[i]) > maxFlip) maxFlip = Math.abs(shore[i]); }
        }
        if (!changed) continue;
        changedRows++;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (column + 1 < columns) { after = Math.max(after, deviation(heights, i, i + 1)); prior = Math.max(prior, deviation(before, i, i + 1)); }
            if (row + 1 < rows) { after = Math.max(after, deviation(heights, i, i + columns)); prior = Math.max(prior, deviation(before, i, i + columns)); }
        }
    }
    return { changedRows, flippedSamples: flipped, maxDisplacementMeters: round6(maxFlip), crossingDeviationMeters: { before: round6(prior), after: round6(after) } };
}

// weight 0 inside the protected plan features (districts, the plan beach points within the radius, the open-view corridor, the
// swim zone of the operator parameters, null for a plan without one) rising to 1 over PROTECT_BLEND_METERS where a distance is available
function planProtection(context, { districts = true, points = true, corridor = false, swimZone = null, radiusMeters = 0 }) {
    const { grid, scope } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, plan = context.plan;
    if (!plan) throw new Error(`[Synthesis] operator ${context.operator.id}: protectPlan needs plan-inputs before it`);
    const weight = scope.allocate('protect', Float32Array, n);
    const districtId = districts ? context.layers.get('districtId') : null, corridorMask = corridor ? context.layers.get('corridorMask') : null;
    const corridorSdf = corridor && plan.beachPoints.corridor ? scope.allocate('protect-corridor', Float32Array, n) : null;
    if (corridorSdf) polygonSignedDistance(grid, plan.beachPoints.corridor, corridorSdf);
    let zone = null;
    if (swimZone) {
        const settings = swimZone, vertices = plan.shoreline.filter(point => point[1] >= settings.zMin && point[1] <= settings.zMax).length;
        zone = { vertices, samples: 0, raster: null };
        if (vertices >= 2) {
            zone.raster = scope.allocate('protect-swim', Uint8Array, n);
            zone.samples = rasterizePolygon(grid, swimZonePolygon({ points_xyz_m: plan.shoreline.map(([x, z]) => [x, 0, z]) }, settings), zone.raster, 1);
        }
    }
    const list = points ? plan.beachPoints.points : [];
    let protectedSamples = 0;
    for (let row = 0; row < rows; row++) {
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, x = minX + column * spacingX;
            let w = 1;
            if (districtId && districtId[i] > 0) w = 0;
            if (corridorMask && corridorMask[i] > 0) w = 0;
            else if (corridorSdf) w = Math.min(w, smoothstep(0, PROTECT_BLEND_METERS, -corridorSdf[i]));
            if (zone?.raster && zone.raster[i]) w = 0;
            for (const point of list) w = Math.min(w, smoothstep(radiusMeters, radiusMeters + PROTECT_BLEND_METERS, Math.hypot(x - point.x, z - point.z)));
            weight[i] = w;
            if (w < 1) protectedSamples++;
        }
    }
    if (zone?.raster) scope.free('protect-swim');
    if (corridorSdf) scope.free('protect-corridor');
    return { weight, protectedSamples, swimZone: zone ? { vertices: zone.vertices, samples: zone.samples } : null };
}

// design-shoreline stations (samples within three quarters of a spacing of the design line) and the nearest station of every sample
function shorelineStations(context, name) {
    const { grid, scope, memory } = context, n = grid.columns * grid.rows, shore = context.layers.get('shoreSigned'), limit = STATION_BAND * Math.min(grid.spacingX, grid.spacingZ);
    const feature = scope.allocate(`${name}-stations`, Uint8Array, n);
    let count = 0;
    for (let i = 0; i < n; i++) if (Math.abs(shore[i]) <= limit) { feature[i] = 1; count++; }
    if (!count) throw new Error(`[Synthesis] operator ${context.operator.id}: the design shoreline does not cross the working grid`);
    const edt = exactDistanceTransform(grid, feature, memory, `op/${context.operator.id}/${name}`);
    return { feature, count, nearest: edt.nearest, distance: edt.distance, release: () => { edt.release(); scope.free(`${name}-stations`); } };
}

function promontory(context, kind) {
    const { params, seed } = context.operator, { grid, seaLevel } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, heights = context.layers.get('height'), mask = context.mask();
    const before = snapshot(context, 'promontory-before'), bearing = params.bearingDegrees * DEGREES, ax = Math.sin(bearing), az = Math.cos(bearing);
    const [cx, cz] = params.center, L = params.lengthMeters, halfWidth = params.widthMeters / 2, headland = kind === 'headland';
    const u0 = headland ? -L / 4 : -L, u1 = headland ? L : L / 4, uc = (u0 + u1) / 2, half = (u1 - u0) / 2, amplitude = headland ? params.heightMeters : -params.depthMeters;
    const noise = params.noiseMeters > 0 ? noiseField(seed, 0, [params.noiseWavelengthMeters, params.noiseWavelengthMeters / 2, params.noiseWavelengthMeters / 4], [1, .5, .25], 'ridged-mix', .7) : null;
    const protect = params.protectPlan ? planProtection(context, { districts: true, points: true, swimZone: params.swimZone, radiusMeters: params.protectRadiusMeters }) : null;
    // a promontory is rock: when the geology ledger exists the rise lifts the bedrock and a scoop removes deposits, regolith and bedrock
    const ledger = context.layers.has('bedrock') ? geologyLedger(context) : null;
    let changed = 0, maxChange = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, x = minX + column * spacingX, u = (x - cx) * ax + (z - cz) * az, v = -(x - cx) * az + (z - cz) * ax;
            const rho = Math.hypot((u - uc) / half, v / halfWidth);
            if (rho >= 1) continue;
            const w = (mask ? mask[i] : 1) * (protect ? protect.weight[i] : 1);
            if (w <= 0) continue;
            const dome = 1 - rho * rho, target = seaLevel + amplitude * dome + (noise ? (headland ? 1 : -1) * params.noiseMeters * dome * noise(x, z) : 0);
            const G = heights[i], designed = headland ? Math.max(G, target) : Math.min(G, target), next = G + w * (designed - G);
            if (next === G) continue;
            if (!ledger) heights[i] = next;
            else if (next > G) { heights[i] = next; ledger.bedrock[i] += heights[i] - G; }
            else ledger.set(i, next, COASTAL_DEPOSIT.none);
            changed++;
            if (Math.abs(next - G) > maxChange) maxChange = Math.abs(next - G);
        }
    }
    const vertices = context.plan.shoreline, affected = [];
    vertices.forEach(([x, z], index) => { const u = (x - cx) * ax + (z - cz) * az, v = -(x - cx) * az + (z - cz) * ax; if (Math.hypot((u - uc) / half, v / halfWidth) < 1) affected.push(index); });
    const shoreline = shorelineReport(context, before);
    return { kind, center: [cx, cz], bearingDegrees: params.bearingDegrees, footprint: { alongMeters: [round6(u0), round6(u1)], halfWidthMeters: halfWidth }, changedSamples: changed, maxChangeMeters: round6(maxChange),
        protectedSamples: protect ? protect.protectedSamples : 0, swimZone: protect ? protect.swimZone : null, shoreline,
        affectedShorelineVertices: affected.length ? { first: affected[0], last: affected[affected.length - 1], count: affected.length } : null };
}

async function landformHeadland(context) { return promontory(context, 'headland'); }
async function landformCove(context) { return promontory(context, 'cove'); }

async function coastalExposure(context) {
    const { params } = context.operator, { grid, scope, memory, seaLevel } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows;
    const heights = context.layers.get('height'), shore = context.layers.get('shoreSigned'), mask = context.mask(), created = [];
    const exposure = ensureLayer(context, 'waveExposure', Float32Array, created), zone = ensureLayer(context, 'coastalZone', Uint8Array, created);
    const feature = scope.allocate('exposure-waterline', Uint8Array, n), station = scope.allocate('exposure-station', Float32Array, n);
    let waterline = 0;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        if (heights[i] < seaLevel) continue;
        if ((column > 0 && heights[i - 1] < seaLevel) || (column + 1 < columns && heights[i + 1] < seaLevel) || (row > 0 && heights[i - columns] < seaLevel) || (row + 1 < rows && heights[i + columns] < seaLevel)) { feature[i] = 1; waterline++; }
    }
    if (!waterline) throw new Error(`[Synthesis] operator ${context.operator.id}: the surface has no sea-level crossing on the working grid`);
    const directions = params.fetchDirections, steps = Math.max(1, Math.ceil(params.fetchMeters / params.rayStepMeters)), step = params.fetchMeters / steps, level = seaLevel + params.surfaceClearanceMeters;
    const maxX = minX + (columns - 1) * spacingX, minZ = maxZ - (rows - 1) * spacingZ, cosines = new Float64Array(directions), sines = new Float64Array(directions), normal = new Float64Array(2);
    for (let k = 0; k < directions; k++) { const angle = (-90 + 180 * (k + .5) / directions) * DEGREES; cosines[k] = Math.cos(angle); sines[k] = Math.sin(angle); }
    let open = 0, total = 0, minimum = 1, maximum = 0, sum = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 16 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (!feature[i]) continue;
            const x = minX + column * spacingX;
            let sx, sz;
            if (landwardNormal(grid, shore, row, column, normal)) { sx = -normal[0]; sz = -normal[1]; }
            else if (column > 0 && heights[i - 1] < seaLevel) { sx = -1; sz = 0; }
            else if (column + 1 < columns && heights[i + 1] < seaLevel) { sx = 1; sz = 0; }
            else if (row > 0 && heights[i - columns] < seaLevel) { sx = 0; sz = 1; }
            else { sx = 0; sz = -1; }
            let openHere = 0;
            for (let k = 0; k < directions; k++) {
                const dx = sx * cosines[k] - sz * sines[k], dz = sx * sines[k] + sz * cosines[k];
                for (let s = 1; s <= steps; s++) {
                    const px = x + dx * s * step, pz = z + dz * s * step;
                    if (px < minX || px > maxX || pz < minZ || pz > maxZ) { openHere++; break; }
                    if (sampleHeight(grid, heights, px, pz) >= level) break;
                    if (s === steps) openHere++;
                }
            }
            const value = openHere / directions;
            station[i] = value; open += openHere; total += directions; sum += value;
            if (value < minimum) minimum = value; if (value > maximum) maximum = value;
        }
    }
    const edt = exactDistanceTransform(grid, feature, memory, `op/${context.operator.id}/exposure`);
    let offshore = 0;
    for (let i = 0; i < n; i++) {
        const d = edt.distance[i], land = heights[i] >= seaLevel, reach = land ? params.inlandReachMeters : params.offshoreReachMeters, fade = reach > 0 ? 1 - smoothstep(0, reach, d) : d <= 0 ? 1 : 0;
        exposure[i] = station[edt.nearest[i]] * fade * (mask ? mask[i] : 1);
        if (!land) { if (zone[i] === COASTAL_ZONE.inland) zone[i] = COASTAL_ZONE.offshore; if (d > reach) offshore++; }
        else if (d > reach && zone[i] === COASTAL_ZONE.offshore) zone[i] = COASTAL_ZONE.inland;
    }
    edt.release();
    scope.free('exposure-waterline', 'exposure-station');
    return { waterlineSamples: waterline, fetchDirections: directions, fetchMeters: params.fetchMeters, rayStepMeters: round6(step), openRays: open, totalRays: total, openFraction: round6(open / total),
        waterlineExposure: { min: round6(minimum), mean: round6(sum / waterline), max: round6(maximum) }, offshoreSamples: offshore, createdLayers: created };
}

async function coastalBluff(context) {
    const { params } = context.operator, { grid, scope, seaLevel } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, mask = context.mask(), created = [];
    const shore = context.layers.get('shoreSigned'), ledger = geologyLedger(context), heights = ledger.heights;
    const zone = ensureLayer(context, 'coastalZone', Uint8Array, created), face = ensureLayer(context, 'faceMask', Float32Array, created);
    created.push(...ledger.created);
    const before = snapshot(context, 'bluff-before'), t = scope.allocate('bluff-t', Float32Array, n), crest = scope.allocate('bluff-crest', Float32Array, n), weight = scope.allocate('bluff-weight', Float32Array, n);
    const protect = params.protectPlan ? planProtection(context, { districts: true, points: true, corridor: true, radiusMeters: params.protectRadiusMeters }) : null;
    const platform = seaLevel + params.platformHeightMeters, tanFace = Math.tan(params.faceSlopeDegrees * DEGREES), tanPlatform = Math.tan(params.platformSlopeDegrees * DEGREES);
    const W = params.platformWidthMeters, blend = params.blendMeters, retreat = params.retreatMeters, crown = params.crownWidthMeters, spacing = Math.min(spacingX, spacingZ), cellArea = spacingX * spacingZ;
    // bluff coordinates per sample: t = distance seaward of the retreated crest, crest = ground height there (pre-operator)
    if (params.source === 'polygon') {
        const sdf = scope.allocate('bluff-sdf', Float32Array, n), qx = scope.allocate('bluff-qx', Float32Array, n), qz = scope.allocate('bluff-qz', Float32Array, n);
        polygonSignedDistance(grid, params.polygon, sdf, qx, qz);
        for (let row = 0; row < rows; row++) {
            const z = maxZ - row * spacingZ;
            for (let column = 0; column < columns; column++) {
                const i = row * columns + column, x = minX + column * spacingX, s = sdf[i], dx = x - qx[i], dz = z - qz[i], length = Math.hypot(dx, dz);
                const ox = length > 1e-9 ? (s > 0 ? -dx : dx) / length : 0, oz = length > 1e-9 ? (s > 0 ? -dz : dz) / length : 0;
                t[i] = retreat - s; crest[i] = sampleHeight(grid, before, qx[i] - ox * retreat, qz[i] - oz * retreat); weight[i] = 1;
            }
        }
        scope.free('bluff-sdf', 'bluff-qx', 'bluff-qz');
    } else {
        const normal = new Float64Array(2), reach = params.maxDistanceFromShoreMeters, stepsMax = Math.ceil(reach / spacing), cliff = seaLevel + params.minCliffHeightMeters;
        const seaward = -(W + blend + 10 * spacing), landward = reach + retreat + crown + spacing;
        for (let row = 0; row < rows; row++) {
            if (row % 64 === 0) context.checkpoint();
            const z = maxZ - row * spacingZ;
            for (let column = 0; column < columns; column++) {
                const i = row * columns + column, s = shore[i];
                if (s < seaward || s > landward || !landwardNormal(grid, shore, row, column, normal)) continue;
                const x = minX + column * spacingX, qx = x - normal[0] * s, qz = z - normal[1] * s;
                let found = -1;
                for (let k = 1; k <= stepsMax; k++) { const d = k * spacing; if (sampleHeight(grid, before, qx + normal[0] * d, qz + normal[1] * d) >= cliff) { found = d; break; } }
                if (found < 0) continue;
                const crestDistance = found + retreat;
                t[i] = crestDistance - s; crest[i] = sampleHeight(grid, before, qx + normal[0] * crestDistance, qz + normal[1] * crestDistance); weight[i] = 1;
            }
        }
    }
    let crestBand = 0, faceSamples = 0, platformSamples = 0, crownSamples = 0, cutVolume = 0, maxCut = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (!weight[i]) continue;
            const w = (mask ? mask[i] : 1) * (protect ? protect.weight[i] : 1);
            weight[i] = w;
            if (w <= 0) continue;
            const tt = t[i], C = crest[i], G = heights[i];
            if (tt < -crown) continue;
            if (tt < 0) { if (w >= .5) { zone[i] = COASTAL_ZONE.bluffCrown; crownSamples++; } continue; }
            const drop = C - platform;
            if (drop <= 0) continue;
            const toe = drop / tanFace;
            let designed;
            if (tt <= toe) { designed = C - tt * tanFace; if (w >= .5) { zone[i] = COASTAL_ZONE.bluffFace; face[i] = 1; faceSamples++; } if (tt < spacing) crestBand++; }
            else if (tt <= toe + W) { designed = platform - (tt - toe) * tanPlatform; if (w >= .5) { zone[i] = tt - toe <= params.toeBandMeters ? COASTAL_ZONE.bluffToe : COASTAL_ZONE.platform; platformSamples++; } }
            else if (tt <= toe + W + blend) { const end = platform - W * tanPlatform; designed = end + (G - end) * (blend > 0 ? smoothstep(0, blend, tt - toe - W) : 1); }
            else continue;
            if (params.notchDepthMeters > 0) designed -= params.notchDepthMeters * Math.max(0, 1 - Math.abs(tt - toe) / (2 * params.notchDepthMeters));
            const next = G + w * (Math.min(G, designed) - G);
            if (next < G) { cutVolume += (G - next) * cellArea; if (G - next > maxCut) maxCut = G - next; }
            ledger.set(i, next, COASTAL_DEPOSIT.none);
        }
    }
    const coastLength = crestBand * spacing;
    let talusHeight = 0, talusSamples = 0, talusVolume = 0;
    if (params.talusVolumeFraction > 0 && cutVolume > 0 && coastLength > 0) {
        // the talus is a wedge against the face: cross-section A per meter of coast = h^2 (cot talus - cot face) / 2
        const cotTalus = 1 / Math.tan(params.talusSlopeDegrees * DEGREES), cotFace = 1 / tanFace;
        talusHeight = Math.sqrt(2 * params.talusVolumeFraction * cutVolume / coastLength / (cotTalus - cotFace));
        for (let row = 0; row < rows; row++) {
            if (row % 64 === 0) context.checkpoint();
            for (let column = 0; column < columns; column++) {
                const i = row * columns + column, w = weight[i];
                if (!(w > 0)) continue;
                const tt = t[i], drop = crest[i] - platform;
                if (tt < 0 || drop <= 0) continue;
                const toe = drop / tanFace, contact = toe - talusHeight * cotFace;
                if (tt < contact || tt > toe + talusHeight * (cotTalus - cotFace)) continue;
                const top = platform + talusHeight - (tt - contact) / cotTalus, G = heights[i];
                if (top <= G) continue;
                const next = G + w * (top - G);
                ledger.set(i, next, COASTAL_DEPOSIT.talus);
                talusVolume += (next - G) * cellArea; talusSamples++;
                if (w >= .5) zone[i] = COASTAL_ZONE.bluffToe;
            }
        }
    }
    const shoreline = shorelineReport(context, before);
    scope.free('bluff-before', 'bluff-t', 'bluff-crest', 'bluff-weight');
    return { source: params.source, retreatMeters: retreat, faceSlopeDegrees: params.faceSlopeDegrees, platformHeightMeters: params.platformHeightMeters, crestSamples: crestBand, coastLengthMeters: round6(coastLength),
        faceSamples, platformSamples, crownSamples, cutVolumeCubicMeters: round6(cutVolume), maxCutMeters: round6(maxCut), talusVolumeFraction: params.talusVolumeFraction, talusHeightMeters: round6(talusHeight), talusSamples,
        talusVolumeCubicMeters: round6(talusVolume), protectedSamples: protect ? protect.protectedSamples : 0, shoreline, createdLayers: created };
}

/**
 * Cross-shore beach profile in landward distance d from the design shoreline: the Dean 1991 equilibrium curve h = -A x^(2/3) seaward
 * of the foreshore (x from a virtual origin chosen so the curve meets the straight foreshore at the swash depth), optionally handing
 * over at deanDepthMeters to a planar shelf at shelfSlopeDegrees that flattens at shelfFloorDepthMeters (AI 596 D4), the straight
 * foreshore 1:N through the waterline, the berm face, the flat berm and the descending backshore (Bosboom & Stive).
 * @param {{deanA:number,foreshoreSlopeRatio:number,swashDepthMeters:number,bermHeightMeters:number,bermDistanceMeters:number,bermFaceRunMeters:number,bermWidthMeters:number,backshoreSlopeDegrees:number,deanDepthMeters?:number|null,shelfSlopeDegrees?:number,shelfFloorDepthMeters?:number}} params @param {number} seaLevel
 */
export function beachProfile(params, seaLevel) {
    const N = params.foreshoreSlopeRatio, A = params.deanA, swash = params.swashDepthMeters, foreshoreSeawardMeters = swash * N, bermDistance = params.bermDistanceMeters, faceRun = params.bermFaceRunMeters;
    const bermHeight = params.bermHeightMeters, bermWidth = params.bermWidthMeters, tanBackshore = Math.tan(params.backshoreSlopeDegrees * DEGREES);
    const x0 = foreshoreSeawardMeters - Math.pow(swash / A, 1.5), foreshoreTop = (bermDistance - faceRun) / N;
    const deanDepth = params.deanDepthMeters ?? null, xDean = deanDepth === null ? Infinity : Math.pow(deanDepth / A, 1.5), tanShelf = Math.tan((params.shelfSlopeDegrees ?? 2) * DEGREES), floor = params.shelfFloorDepthMeters ?? 30;
    const heightAt = d => {
        if (d < -foreshoreSeawardMeters) {
            const x = -d - x0;
            if (x <= xDean) return seaLevel - A * Math.cbrt(x * x);
            return seaLevel - Math.min(floor, deanDepth + (x - xDean) * tanShelf);
        }
        if (d <= bermDistance - faceRun) return seaLevel + d / N;
        if (d <= bermDistance) return seaLevel + foreshoreTop + (bermHeight - foreshoreTop) * (d - (bermDistance - faceRun)) / faceRun;
        if (d <= bermDistance + bermWidth) return seaLevel + bermHeight;
        return seaLevel + bermHeight - (d - bermDistance - bermWidth) * tanBackshore;
    };
    // distances (landward, negative = seaward of the design shoreline) of the Dean handover and of the shelf floor, null without a handover
    const deanDepthDistance = deanDepth === null ? null : -(xDean + x0), floorDistance = deanDepth === null ? null : -(xDean + (floor - deanDepth) / tanShelf + x0);
    return Object.freeze({ x0, foreshoreSeawardMeters, foreshoreTop, bermDistance, bermWidth, heightAt, deanDepthDistance, floorDistance });
}

function measureBeachTransects(context, before, applied, profile, params) {
    const { grid, seaLevel } = context, { columns, spacingX, spacingZ } = grid, heights = context.layers.get('height'), shore = context.layers.get('shoreSigned'), vertices = context.plan.shoreline;
    const count = Math.min(params.transectCount, vertices.length), normal = new Float64Array(2), step = Math.min(spacingX, spacingZ) / 2, transects = [];
    const bermCenter = profile.bermDistance + profile.bermWidth / 2, end = params.beachBandMeters + params.blendMeters + 5;
    for (let k = 0; k < count; k++) {
        const vertex = Math.floor((k + .5) * vertices.length / count), [vx, vz] = vertices[vertex], i = nearestIndex(grid, vx, vz);
        if (!landwardNormal(grid, shore, Math.floor(i / columns), i % columns, normal)) continue;
        const at = (values, d) => sampleHeight(grid, values, vx + normal[0] * d, vz + normal[1] * d);
        const weight = applied[nearestIndex(grid, vx + normal[0] * bermCenter, vz + normal[1] * bermCenter)];
        const d1 = -profile.foreshoreSeawardMeters + 1, d2 = profile.bermDistance - params.bermFaceRunMeters - 1, rise = at(heights, d2) - at(heights, d1);
        const bermHeight = at(heights, bermCenter) - seaLevel;
        let bermAt = null, meets = null;
        for (let d = 0; d <= profile.bermDistance + profile.bermWidth; d += step) if (at(heights, d) - seaLevel >= .99 * bermHeight) { bermAt = d; break; }
        for (let d = profile.bermDistance + profile.bermWidth; d <= end; d += step) if (Math.abs(at(heights, d) - at(before, d)) < .05) { meets = d; break; }
        transects.push({ vertex, x: vx, z: vz, applied: weight >= .5, foreshoreSlopeRatio: rise > 0 ? round6((d2 - d1) / rise) : null, bermHeightMeters: round6(bermHeight), bermDistanceMeters: bermAt === null ? null : round6(bermAt), backshoreMeetsGroundMeters: meets === null ? null : round6(meets) });
    }
    const used = transects.filter(entry => entry.applied), mean = key => { const values = used.map(entry => entry[key]).filter(value => value !== null); return values.length ? round6(values.reduce((sum, value) => sum + value, 0) / values.length) : null; };
    return { transects, summary: { applied: used.length, foreshoreSlopeRatio: mean('foreshoreSlopeRatio'), bermHeightMeters: mean('bermHeightMeters'), bermDistanceMeters: mean('bermDistanceMeters'), backshoreMeetsGroundMeters: mean('backshoreMeetsGroundMeters') } };
}

async function coastalBeach(context) {
    const { params } = context.operator, { grid, scope, seaLevel } = context, { columns, rows, spacingX, spacingZ } = grid, n = columns * rows, mask = context.mask(), created = [];
    const shore = context.layers.get('shoreSigned'), ledger = geologyLedger(context), heights = ledger.heights, zone = ensureLayer(context, 'coastalZone', Uint8Array, created);
    created.push(...ledger.created);
    const before = snapshot(context, 'beach-before'), applied = scope.allocate('beach-applied', Float32Array, n), profile = beachProfile(params, seaLevel);
    const protect = params.protectPlan ? planProtection(context, { districts: true, points: true, radiusMeters: params.protectRadiusMeters }) : null;
    const band = params.beachBandMeters, blend = params.blendMeters, reach = params.offshoreReachMeters, seawardEnd = profile.foreshoreSeawardMeters, surf = seaLevel - params.surfDepthMeters, cellArea = spacingX * spacingZ;
    const replaceOffshore = params.offshoreMode === 'replace', zones = { surf: 0, swash: 0, berm: 0, backshore: 0 };
    let raised = 0, lowered = 0, fillVolume = 0, cutVolume = 0, veneered = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, d = shore[i];
            if (d > band || d < -reach) continue;
            const G = heights[i];
            let designed, w;
            if (d >= -seawardEnd) { designed = profile.heightAt(d); w = blend > 0 ? 1 - smoothstep(band - blend, band, d) : 1; }
            else { const P = profile.heightAt(d); designed = replaceOffshore ? P : Math.min(G, P); w = blend > 0 ? 1 - smoothstep(reach - blend, reach, -d) : 1; }
            w *= (mask ? mask[i] : 1) * (protect ? protect.weight[i] : 1);
            if (w <= 0) continue;
            applied[i] = w;
            const next = G + w * (designed - G);
            ledger.set(i, next, COASTAL_DEPOSIT.beachSand);
            if (next > G) { raised++; fillVolume += (next - G) * cellArea; } else if (next < G) { lowered++; cutVolume += (G - next) * cellArea; }
            if (w < .5) continue;
            if (ledger.veneer(i, params.minSandMeters, COASTAL_DEPOSIT.beachSand) > 0) veneered++;
            if (d >= profile.bermDistance + profile.bermWidth) { zone[i] = COASTAL_ZONE.backshore; zones.backshore++; }
            else if (d >= profile.bermDistance) { zone[i] = COASTAL_ZONE.berm; zones.berm++; }
            else if (d >= -seawardEnd) { zone[i] = COASTAL_ZONE.swash; zones.swash++; }
            else if (heights[i] >= surf) { zone[i] = COASTAL_ZONE.surf; zones.surf++; }
        }
    }
    const measured = measureBeachTransects(context, before, applied, profile, params), shoreline = shorelineReport(context, before);
    scope.free('beach-before', 'beach-applied');
    return { deanA: params.deanA, deanOriginMeters: round6(profile.x0), offshoreMode: params.offshoreMode, deanDepthMeters: params.deanDepthMeters, deanDepthDistanceMeters: profile.deanDepthDistance === null ? null : round6(profile.deanDepthDistance),
        shelfSlopeDegrees: params.deanDepthMeters === null ? null : params.shelfSlopeDegrees, shelfFloorDistanceMeters: profile.floorDistance === null ? null : round6(profile.floorDistance),
        foreshoreSlopeRatio: params.foreshoreSlopeRatio, foreshoreSeawardMeters: round6(seawardEnd), foreshoreTopMeters: round6(profile.foreshoreTop), bermHeightMeters: params.bermHeightMeters,
        bermDistanceMeters: params.bermDistanceMeters, raisedSamples: raised, loweredSamples: lowered, fillVolumeCubicMeters: round6(fillVolume), cutVolumeCubicMeters: round6(cutVolume), veneeredSamples: veneered, zoneSamples: zones,
        protectedSamples: protect ? protect.protectedSamples : 0, transects: measured.transects, transectSummary: measured.summary, shoreline, createdLayers: created };
}

async function coastalForedune(context) {
    const { params, seed } = context.operator, { grid, scope } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, mask = context.mask(), created = [];
    const shore = context.layers.get('shoreSigned'), districtId = context.layers.get('districtId'), roadDistance = context.layers.get('roadDistance'), roadWidth = context.layers.get('roadWidth'), corridorMask = context.layers.get('corridorMask');
    const zone = context.layers.get('coastalZone'), ledger = geologyLedger(context), heights = ledger.heights;
    created.push(...ledger.created);
    const before = snapshot(context, 'dune-before'), stations = shorelineStations(context, 'dune'), free = scope.allocate('dune-free', Float32Array, n), normal = new Float64Array(2);
    const protect = params.protectPlan ? planProtection(context, { districts: true, points: true, corridor: true, radiusMeters: params.protectRadiusMeters }) : null;
    const cotSeaward = 1 / Math.tan(params.seawardSlopeDegrees * DEGREES), cotLee = 1 / Math.tan(params.leeSlopeDegrees * DEGREES), needed = params.heightMeters * (cotSeaward + cotLee);
    const effectiveHeight = needed > params.widthMeters ? params.widthMeters / (cotSeaward + cotLee) : params.heightMeters, flat = Math.max(0, params.widthMeters - effectiveHeight * (cotSeaward + cotLee));
    // the seaward face may not start seaward of the base: its run is clipped to the crest distance (a steeper effective face, reported)
    const seawardRun = crest => Math.min(params.crestDistanceMeters - flat / 2, crest * cotSeaward), effectiveSeawardSlope = Math.atan(effectiveHeight / seawardRun(effectiveHeight)) / DEGREES;
    const base = params.baseDistanceMeters, search = params.minSpaceMeters + params.crestDistanceMeters + params.widthMeters, step = Math.min(spacingX, spacingZ), cellArea = spacingX * spacingZ;
    // free space landward of the berm per design-shoreline station: the distance to the first district, road, corridor or bluff sample
    let stationCount = 0, roomy = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (!stations.feature[i]) continue;
            stationCount++;
            if (!landwardNormal(grid, shore, row, column, normal)) continue;
            const x = minX + column * spacingX, s = shore[i], qx = x - normal[0] * s, qz = z - normal[1] * s;
            let room = search;
            for (let d = base; d <= base + search; d += step) {
                const j = nearestIndex(grid, qx + normal[0] * d, qz + normal[1] * d);
                if (districtId[j] > 0 || roadDistance[j] <= roadWidth[j] / 2 + params.roadMarginMeters || corridorMask[j] > 0 || (zone[j] >= COASTAL_ZONE.platform && zone[j] <= COASTAL_ZONE.bluffCrown)) { room = d - base; break; }
            }
            free[i] = room;
            if (room >= params.minSpaceMeters) roomy++;
        }
    }
    const noise = params.heightVariationMeters > 0 ? noiseField(seed, 0, [params.wavelengthMeters, params.wavelengthMeters / 2], [1, .5]) : null, crestDistance = base + params.crestDistanceMeters, blend = params.blendMeters;
    let duneSamples = 0, volume = 0, maxCrest = 0, zoned = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, d = shore[i];
            if (d < base || d > base + search) continue;
            const room = free[stations.nearest[i]];
            if (room < params.minSpaceMeters) continue;
            const x = minX + column * spacingX, crest = Math.max(.25 * effectiveHeight, effectiveHeight + (noise ? params.heightVariationMeters * noise(x, z) : 0)), u = d - crestDistance;
            const dune = u < -flat / 2 ? crest * Math.max(0, 1 + (u + flat / 2) / seawardRun(crest)) : u > flat / 2 ? crest * Math.max(0, 1 - (u - flat / 2) / (crest * cotLee)) : crest;
            if (dune <= 0) continue;
            let w = (mask ? mask[i] : 1) * (protect ? protect.weight[i] : 1);
            if (blend > 0) w *= 1 - smoothstep(room - blend, room, d - base);
            if (w <= 0) continue;
            const G = heights[i], next = G + w * dune;
            ledger.set(i, next, COASTAL_DEPOSIT.duneSand);
            duneSamples++; volume += (next - G) * cellArea;
            if (next - G > maxCrest) maxCrest = next - G;
            if (next - G >= .2) { zone[i] = COASTAL_ZONE.foredune; zoned++; }
        }
    }
    const shoreline = shorelineReport(context, before);
    stations.release(); scope.free('dune-before', 'dune-free');
    return { seed, heightMeters: params.heightMeters, effectiveHeightMeters: round6(effectiveHeight), effectiveSeawardSlopeDegrees: round6(effectiveSeawardSlope), crestFlatMeters: round6(flat),
        footprintMeters: round6(seawardRun(effectiveHeight) + flat + effectiveHeight * cotLee), stations: stationCount, stationsWithRoom: roomy,
        duneSamples, zonedSamples: zoned, maxCrestMeters: round6(maxCrest), volumeCubicMeters: round6(volume), protectedSamples: protect ? protect.protectedSamples : 0, shoreline, createdLayers: created };
}

async function coastalNearshore(context) {
    const { params, seed } = context.operator, { grid, scope, seaLevel } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, mask = context.mask(), created = [];
    const shore = context.layers.get('shoreSigned'), ledger = geologyLedger(context), heights = ledger.heights, zone = ensureLayer(context, 'coastalZone', Uint8Array, created);
    created.push(...ledger.created);
    const before = snapshot(context, 'bar-before'), stations = params.barDistanceMeters === null ? shorelineStations(context, 'bar') : null, crestAt = stations ? scope.allocate('bar-crest', Float32Array, n) : null;
    const step = Math.min(spacingX, spacingZ), normal = new Float64Array(2), depth = seaLevel + params.barDepthMeters;
    let stationCount = 0, located = 0;
    if (stations) {
        for (let row = 0; row < rows; row++) {
            const z = maxZ - row * spacingZ;
            for (let column = 0; column < columns; column++) {
                const i = row * columns + column;
                if (!stations.feature[i]) continue;
                stationCount++;
                if (!landwardNormal(grid, shore, row, column, normal)) continue;
                const x = minX + column * spacingX, s = shore[i], qx = x - normal[0] * s, qz = z - normal[1] * s;
                for (let d = step; d <= params.searchMeters; d += step) if (sampleHeight(grid, before, qx - normal[0] * d, qz - normal[1] * d) <= depth) { crestAt[i] = d; located++; break; }
            }
        }
    }
    const noise = params.wanderMeters > 0 ? noiseField(seed, 0, [params.wavelengthMeters, params.wavelengthMeters / 2], [1, .5]) : null;
    const halfBar = params.barWidthMeters / 2, halfTrough = params.troughWidthMeters / 2, ceiling = seaLevel + params.maxCrestDepthMeters, cellArea = spacingX * spacingZ;
    let barSamples = 0, troughSamples = 0, volume = 0, crestSamples = 0, crestSum = 0, crestDistanceSum = 0, crestMin = Infinity, crestMax = -Infinity, zoned = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, G = heights[i], seawardDistance = -shore[i];
            if (G >= seaLevel || seawardDistance < 0) continue;
            const crestDistance = stations ? crestAt[stations.nearest[i]] : params.barDistanceMeters;
            if (!(crestDistance > 0)) continue;
            const x = minX + column * spacingX, center = crestDistance + (noise ? params.wanderMeters * noise(x, z) : 0);
            if (seawardDistance < center - halfBar - params.troughWidthMeters || seawardDistance > center + halfBar) continue;
            const bump = params.barHeightMeters * hump((seawardDistance - center) / halfBar), dip = params.troughDepthMeters * hump((seawardDistance - (center - halfBar - halfTrough)) / halfTrough);
            let designed = G + bump - dip;
            if (designed > ceiling) designed = Math.max(G, ceiling);
            const w = mask ? mask[i] : 1, next = G + w * (designed - G);
            if (next === G) continue;
            ledger.set(i, next, COASTAL_DEPOSIT.beachSand);
            volume += (next - G) * cellArea;
            if (next > G) barSamples++; else troughSamples++;
            if (w >= .5 && bump >= .3 * params.barHeightMeters) { zone[i] = COASTAL_ZONE.bar; zoned++; }
            if (bump >= .98 * params.barHeightMeters) { crestSamples++; crestSum += heights[i] - seaLevel; crestDistanceSum += seawardDistance; if (heights[i] < crestMin) crestMin = heights[i]; if (heights[i] > crestMax) crestMax = heights[i]; }
        }
    }
    const shoreline = shorelineReport(context, before);
    if (stations) { stations.release(); scope.free('bar-crest'); }
    scope.free('bar-before');
    return { seed, barDistanceMeters: params.barDistanceMeters, barDepthMeters: params.barDepthMeters, stations: stationCount, locatedStations: located, barSamples, troughSamples, zonedSamples: zoned, volumeCubicMeters: round6(volume),
        crest: crestSamples ? { samples: crestSamples, meanDepthMeters: round6(crestSum / crestSamples), minDepthMeters: round6(crestMin - seaLevel), maxDepthMeters: round6(crestMax - seaLevel), meanDistanceMeters: round6(crestDistanceSum / crestSamples) } : null,
        shoreline, createdLayers: created };
}

async function coastalReef(context) {
    const { params, seed } = context.operator, { grid, scope, seaLevel } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, mask = context.mask(), created = [];
    const ledger = geologyLedger(context), heights = ledger.heights, zone = ensureLayer(context, 'coastalZone', Uint8Array, created);
    created.push(...ledger.created);
    const before = snapshot(context, 'reef-before'), protect = params.protectPlan ? planProtection(context, { districts: false, points: false, swimZone: params.swimZone }) : null;
    const floor = seaLevel + params.minDepthMeters, ceiling = seaLevel + params.maxDepthMeters, noise = noiseField(seed, 0, params.wavelengthsMeters, params.amplitudes, 'ridged-mix', params.ridgedMix);
    const values = scope.allocate('reef-noise', Float32Array, n), eligible = scope.allocate('reef-eligible', Uint8Array, n);
    let count = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (heights[i] >= ceiling) continue;
            const w = (mask ? mask[i] : 1) * (protect ? protect.weight[i] : 1);
            if (w <= 0) continue;
            eligible[i] = 1; values[i] = noise(minX + column * spacingX, z); count++;
        }
    }
    let threshold = null, reefSamples = 0, volume = 0, maxRaise = 0, zoned = 0, topMin = Infinity, topMax = -Infinity;
    if (count) {
        // the coverage threshold is the exact quantile of the noise over the eligible samples, so the declared fraction is met
        const sorted = scope.allocate('reef-sorted', Float32Array, count);
        let k = 0;
        for (let i = 0; i < n; i++) if (eligible[i]) sorted[k++] = values[i];
        sorted.sort();
        threshold = sorted[Math.min(count - 1, Math.max(0, Math.floor((1 - params.coverageFraction) * (count - 1))))];
        const span = sorted[count - 1] - threshold, cellArea = spacingX * spacingZ;
        scope.free('reef-sorted');
        for (let i = 0; i < n; i++) {
            if (!eligible[i]) continue;
            const f = span > 0 ? clamp01((values[i] - threshold) / span) : values[i] >= threshold ? 1 : 0;
            if (f <= 0) continue;
            const G = heights[i], target = Math.min(ceiling, floor + (ceiling - floor) * f);
            if (target <= G) continue;
            const w = (mask ? mask[i] : 1) * (protect ? protect.weight[i] : 1), next = G + w * (target - G);
            ledger.set(i, next, COASTAL_DEPOSIT.reefRock);
            reefSamples++; volume += (next - G) * cellArea;
            if (next - G > maxRaise) maxRaise = next - G;
            if (heights[i] < topMin) topMin = heights[i]; if (heights[i] > topMax) topMax = heights[i];
            if (w >= .5 && next - G >= .1) { zone[i] = COASTAL_ZONE.reef; zoned++; }
        }
    }
    const shoreline = shorelineReport(context, before);
    scope.free('reef-before', 'reef-noise', 'reef-eligible');
    return { seed, coverageFraction: params.coverageFraction, eligibleSamples: count, reefSamples, reefFraction: count ? round6(reefSamples / count) : null, noiseThreshold: threshold === null ? null : round6(threshold), zonedSamples: zoned,
        maxRaiseMeters: round6(maxRaise), volumeCubicMeters: round6(volume), reefTopDepthMeters: reefSamples ? [round6(topMin - seaLevel), round6(topMax - seaLevel)] : null, swimZone: protect ? protect.swimZone : null,
        protectedSamples: protect ? protect.protectedSamples : 0, shoreline, createdLayers: created };
}

export const COASTAL_OPERATORS = Object.freeze({ 'landform-headland': landformHeadland, 'landform-cove': landformCove, 'coastal-exposure': coastalExposure, 'coastal-bluff': coastalBluff, 'coastal-beach': coastalBeach,
    'coastal-foredune': coastalForedune, 'coastal-nearshore': coastalNearshore, 'coastal-reef': coastalReef });
