// Implements the erosion operators: fluvial-erosion (implicit stream power), hydraulic-erosion (droplets), thermal-weathering (repose talus) and sediment-deposit (transport-limited routing).
// @ts-check
// The four operators share one material column: the surface is bedrock + regolith + loose deposits (talus, colluvium, alluvium, sand,
// reef rock) and every height change is booked into that column, so height === bedrock + regolith + depositThickness holds after each
// of them up to float32 rounding (loose deposits erode before regolith, regolith before bedrock; the first erosion operator of a recipe
// creates the column from the height). Sources: Braun & Willett 2013 (the O(n) implicit stream-power solver, n = 1, on a drainage tree
// whose receivers are solved before their donors; here the tree is the steepest descent on the Priority-Flood filled surface, flats
// drain to their earliest-flooded neighbour, outlets stay fixed base levels, and the contributing areas are the Quinn 1991
// multiple-flow-direction areas of the terrain fields), Beyer 2015 "Implementation of a method for hydraulic erosion" (particle
// droplets with bilinear height and gradient, inertia, capacity, a radius brush and corner deposition), Musgrave, Kolb & Mace 1989
// (thermal weathering and talus at the angle of repose, here with per-material angles and two buffers so the transport is order
// independent), and a transport-limited sediment routing with capacity ~ A^a S^b over the Quinn network. Every deposit is bounded by
// the repose plane of the receiving sample's neighbours (reposeCeiling: never above h_j + d_ij tan(repose) for every neighbour j), so no
// operator can leave a one-sample needle at any spacing; what a sample refuses stays in the droplet's load, in the downstream flux or
// at the thermal donors (mass is conserved, the refusals are reported). Everything runs in float64 on float32 layers in a fixed
// visitation order, droplet starts come from a counter hash of the operator seed, and every change is scaled by the operator mask, so
// repeated runs are bit identical.
import { robustPercentiles } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { TERRAIN_NEIGHBORS, flowAccumulation, priorityFlood, resolveFlats } from '../../terrain_fields/TerrainFieldsHydrology.mjs';

const DEGREES = Math.PI / 180, FLOW_EXPONENT = 1.1, FLOW_PERCENTILES = Object.freeze([60, 99.7]), DIFFUSION_STABILITY = .45, LOOSE_EPSILON = 1e-3, REPOSE_TOLERANCE = Math.tan(.01 * DEGREES), ROLL_LIMIT = 512;
const MFD_CONTOUR_FACTOR = Object.freeze([.5, .354, .5, .354, .5, .354, .5, .354]);
const FLOOD_ARRAYS = Object.freeze(['flood/filled', 'flood/order']), FLATS_ARRAYS = Object.freeze(['flats/flat', 'flats/mask', 'flats/processing']), FLOW_ARRAYS = Object.freeze(['flow/area']);
const FATE = Object.freeze({ expired: 0, left: 1, stopped: 2, sea: 3 });
const round6 = value => Math.round(value * 1e6) / 1e6;

/** Deposit type ids of the depositType layer (spec table). */
export const DEPOSIT_TYPES = Object.freeze({ none: 0, talus: 1, colluvium: 2, alluvium: 3, beachSand: 4, duneSand: 5, reefRock: 6 });
/** Drainage class ids of the drainage layer (spec table). */
export const DRAINAGE_CLASSES = Object.freeze({ hillslope: 0, rill: 1, gully: 2, channel: 3, pond: 4, sea: 5 });

/** lowbias32 hash of (seed, index) scaled to [0, 1): the deterministic replacement of Math.random. @param {number} seed @param {number} index */
export function hashUnit(seed, index) {
    let z = (Math.imul(index, 0x9e3779b9) ^ seed) | 0;
    z = Math.imul(z ^ z >>> 16, 0x21f0aaad);
    z = Math.imul(z ^ z >>> 15, 0x735a2d97);
    return ((z ^ z >>> 15) >>> 0) / 4294967296;
}

/** Index offsets, row/column steps and distances (meters) of the 8 neighbours in the TERRAIN_NEIGHBORS order. @param {{columns:number,spacingX:number,spacingZ:number}} grid */
export function neighborTable(grid) {
    const { columns, spacingX, spacingZ } = grid, offset = new Int32Array(8), distance = new Float64Array(8), dr = new Int32Array(8), dc = new Int32Array(8);
    TERRAIN_NEIGHBORS.forEach(([r, c], k) => { dr[k] = r; dc[k] = c; offset[k] = r * columns + c; distance[k] = Math.hypot(r * spacingZ, c * spacingX); });
    return { offset, distance, dr, dc };
}

/**
 * The height a sample may be raised to before it stands above the repose plane of its neighbours: the minimum over its 8-neighbours j of
 * h_j + d_ij * tangent, where a neighbour beyond the landscape edge is the virtual one continuing the local slope through the sample (as
 * thermal weathering sees it, so the edge is no wall a deposit can pile against). A deposit clamped to it can never be a needle (one
 * sample above everything around it) at any spacing, because the bound is the physical plane through the neighbours, not a count of samples.
 * @param {Float32Array} heights @param {{columns:number,rows:number}} grid @param {ReturnType<typeof neighborTable>} neighbors @param {number} row @param {number} column @param {number} i @param {number} tangent
 */
export function reposeCeiling(heights, grid, neighbors, row, column, i, tangent) {
    const { columns, rows } = grid, { offset, distance, dr, dc } = neighbors, h = heights[i];
    let ceiling = Infinity;
    for (let k = 0; k < 8; k++) {
        const r = row + dr[k], c = column + dc[k];
        let hj;
        if (r < 0 || c < 0 || r >= rows || c >= columns) {
            const ro = row - dr[k], co = column - dc[k];
            if (ro < 0 || co < 0 || ro >= rows || co >= columns) continue;
            hj = 2 * h - heights[ro * columns + co];
        } else hj = heights[i + offset[k]];
        const limit = hj + distance[k] * tangent;
        if (limit < ceiling) ceiling = limit;
    }
    return ceiling;
}

/**
 * Whether a border sample's continued slope beyond the landscape edge lies below `lowest` (the height of its lowest in-grid neighbour, or
 * its own when it has none): material rolling on from such a sample leaves the landscape instead of piling against the edge.
 * @param {Float32Array} heights @param {{columns:number,rows:number}} grid @param {ReturnType<typeof neighborTable>} neighbors @param {number} row @param {number} column @param {number} i @param {number} lowest
 */
export function slopesOffEdge(heights, grid, neighbors, row, column, i, lowest) {
    const { columns, rows } = grid, { dr, dc } = neighbors;
    if (row > 0 && column > 0 && row < rows - 1 && column < columns - 1) return false;
    const h = heights[i];
    for (let k = 0; k < 8; k++) {
        const r = row + dr[k], c = column + dc[k];
        if (r >= 0 && c >= 0 && r < rows && c < columns) continue;
        const ro = row - dr[k], co = column - dc[k];
        if (ro < 0 || co < 0 || ro >= rows || co >= columns) continue;
        if (2 * h - heights[ro * columns + co] < lowest) return true;
    }
    return false;
}

const layerOf = (layers, name, Type) => layers.has(name) ? layers.get(name) : layers.create(name, Type);

/** The material column layers, created from the height when absent (bedrock = height, nothing loose). @param {any} context */
export function geologyColumn(context) {
    const { layers } = context, heights = layers.get('height');
    let bedrock;
    if (layers.has('bedrock')) bedrock = layers.get('bedrock');
    else { bedrock = layers.create('bedrock', Float32Array); bedrock.set(heights); }
    return { heights, bedrock, regolith: layerOf(layers, 'regolith', Float32Array), depositType: layerOf(layers, 'depositType', Uint8Array), depositThickness: layerOf(layers, 'depositThickness', Float32Array) };
}

function erodeColumn(column, i, amount) {
    let remaining = amount;
    const deposit = column.depositThickness[i];
    if (deposit > 0) {
        if (deposit > remaining) { column.depositThickness[i] = deposit - remaining; return 0; }
        remaining -= deposit; column.depositThickness[i] = 0; column.depositType[i] = 0;
    }
    const regolith = column.regolith[i];
    if (regolith > 0) {
        if (regolith > remaining) { column.regolith[i] = regolith - remaining; return 0; }
        remaining -= regolith; column.regolith[i] = 0;
    }
    column.bedrock[i] -= remaining;
    return remaining;
}

function erodeLoose(column, i, amount) {
    let removed = 0, remaining = amount;
    const deposit = column.depositType[i] === DEPOSIT_TYPES.reefRock ? 0 : column.depositThickness[i];
    if (deposit > 0) {
        if (deposit > remaining) { column.depositThickness[i] = deposit - remaining; return amount; }
        removed = deposit; remaining -= deposit; column.depositThickness[i] = 0; column.depositType[i] = 0;
    }
    const regolith = column.regolith[i];
    if (regolith > 0) {
        if (regolith > remaining) { column.regolith[i] = regolith - remaining; return removed + remaining; }
        removed += regolith; column.regolith[i] = 0;
    }
    return removed;
}

// the dominant type is the larger body: a new type takes over when it exceeds what lies there
function addDeposit(column, i, type, amount) {
    const existing = column.depositThickness[i];
    if (existing <= 0 || column.depositType[i] === type || amount > existing) column.depositType[i] = type;
    column.depositThickness[i] = existing + amount;
}

/** Largest |height - (bedrock + regolith + depositThickness)| in meters. @param {ReturnType<typeof geologyColumn>} column @param {number} n */
export function columnInvariantError(column, n) {
    let worst = 0;
    for (let i = 0; i < n; i++) { const error = Math.abs(column.heights[i] - (column.bedrock[i] + column.regolith[i] + column.depositThickness[i])); if (error > worst) worst = error; }
    return worst;
}

function markOutlets(grid, heights, seaLevel, outlet) {
    const { columns, rows } = grid;
    let count = 0;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column, value = row === 0 || column === 0 || row === rows - 1 || column === columns - 1 || heights[i] < seaLevel ? 1 : 0;
        outlet[i] = value; count += value;
    }
    return count;
}

function ownArrays(context, names) { for (const name of names) context.own(name); }
function freeArrays(context, names) { context.memory.free(...names); for (const name of names) context.disown(name); }

// Priority-Flood of the current surface, receivers (steepest descent on the filled surface, else the earliest-flooded equal-level
// neighbour, whose flood-parent chain always reaches an outlet) and the Quinn MFD contributing area accumulated donors first
function fluvialRouting(context, state) {
    const { grid, memory, seaLevel } = context, { columns, rows, spacingX, spacingZ } = grid, n = columns * rows, { heights, outlet, rank, receiver, direction, areaFactor, weights } = state, { offset, distance, dr, dc } = state.neighbors;
    markOutlets(grid, heights, seaLevel, outlet);
    const flood = priorityFlood(grid, heights, outlet, memory);
    ownArrays(context, FLOOD_ARRAYS);
    const { filled, order } = flood;
    for (let k = 0; k < n; k++) rank[order[k]] = k;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column;
            if (outlet[i]) { receiver[i] = -1; direction[i] = 0; continue; }
            const level = filled[i];
            let best = -1, bestSlope = 0, bestK = 0, flatBest = -1, flatK = 0, bestRank = rank[i];
            for (let k = 0; k < 8; k++) {
                const r = row + dr[k], c = column + dc[k];
                if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
                const j = i + offset[k], lj = filled[j];
                if (lj < level) { const slope = (level - lj) / distance[k]; if (slope > bestSlope) { bestSlope = slope; best = j; bestK = k; } }
                else if (lj === level && rank[j] < bestRank) { bestRank = rank[j]; flatBest = j; flatK = k; }
            }
            if (best < 0) { best = flatBest; bestK = flatK; }
            if (best < 0) throw new Error(`[Synthesis] operator ${context.operator.id}: sample ${column},${row} has no receiver after Priority-Flood`);
            receiver[i] = best; direction[i] = bestK;
        }
    }
    areaFactor.fill(spacingX * spacingZ);
    for (let k = n - 1; k >= 0; k--) {
        const i = order[k];
        if (outlet[i]) continue;
        const row = (i / columns) | 0, column = i - row * columns, level = filled[i], amount = areaFactor[i];
        let total = 0;
        for (let j = 0; j < 8; j++) {
            weights[j] = 0;
            const r = row + dr[j], c = column + dc[j];
            if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
            const lj = filled[i + offset[j]];
            if (lj < level) { weights[j] = Math.pow((level - lj) / distance[j], FLOW_EXPONENT) * MFD_CONTOUR_FACTOR[j]; total += weights[j]; }
        }
        if (total > 0) { for (let j = 0; j < 8; j++) if (weights[j] > 0) areaFactor[i + offset[j]] += amount * weights[j] / total; }
        else areaFactor[receiver[i]] += amount;
    }
    state.order = order; state.filled = filled;
    return flood.statistics;
}

// explicit linear diffusion (creep) in stability-limited sub-steps; lowering erodes the column, raising thickens the regolith; outlets stay
function diffuse(context, column, state, mask, D, dt) {
    const { grid } = context, { columns, rows, spacingX, spacingZ } = grid, { heights, regolith } = column, { outlet, source } = state;
    const subSteps = Math.max(1, Math.ceil(D * dt * (1 / (spacingX * spacingX) + 1 / (spacingZ * spacingZ)) / DIFFUSION_STABILITY)), step = D * dt / subSteps, ax = step / (spacingX * spacingX), az = step / (spacingZ * spacingZ);
    let lowered = 0, raised = 0;
    for (let s = 0; s < subSteps; s++) {
        source.set(heights);
        for (let row = 0; row < rows; row++) {
            const north = row > 0 ? -columns : 0, south = row + 1 < rows ? columns : 0;
            for (let col = 0; col < columns; col++) {
                const i = row * columns + col;
                if (outlet[i]) continue;
                const h = source[i], west = col > 0 ? source[i - 1] : h, east = col + 1 < columns ? source[i + 1] : h;
                const delta = ((west + east - 2 * h) * ax + (source[i + north] + source[i + south] - 2 * h) * az) * (mask ? mask[i] : 1);
                if (delta === 0) continue;
                heights[i] = h + delta;
                const actual = heights[i] - h;
                if (actual < 0) { erodeColumn(column, i, -actual); lowered -= actual; } else { regolith[i] += actual; raised += actual; }
            }
        }
    }
    return { subSteps, lowered, raised };
}

async function fluvialErosion(context) {
    const started = performance.now(), { params } = context.operator, { grid, seaLevel, scope, layers, memory } = context, { columns, rows, spacingX, spacingZ } = grid, n = columns * rows, cellArea = spacingX * spacingZ;
    const column = geologyColumn(context), { heights, bedrock } = column, mask = context.mask();
    const wear = layerOf(layers, 'wear', Float32Array), flow = layerOf(layers, 'flow', Float32Array), drainage = layerOf(layers, 'drainage', Uint8Array);
    const hardness = params.useHardness && layers.has('hardness') ? layers.get('hardness') : null;
    const state = { heights, outlet: scope.allocate('fluvial-outlet', Uint8Array, n), rank: scope.allocate('fluvial-rank', Int32Array, n), receiver: scope.allocate('fluvial-receiver', Int32Array, n), direction: scope.allocate('fluvial-direction', Uint8Array, n),
        areaFactor: scope.allocate('fluvial-area', Float32Array, n), source: params.diffusivity > 0 ? scope.allocate('fluvial-diffusion-source', Float32Array, n) : null, neighbors: neighborTable(grid), weights: new Float64Array(8), order: null, filled: null };
    const { outlet, receiver, direction, areaFactor } = state, { distance } = state.neighbors, incision = scope.allocate('fluvial-incision', Float32Array, n);
    const target = params.uplift === 'retain-target' ? scope.allocate('fluvial-target', Float32Array, n) : null;
    if (target) target.set(heights);
    const upliftMode = params.uplift === 'retain-target' ? 1 : params.uplift === 'constant' ? 2 : 0, retainRate = params.retainRate, upliftPerIteration = params.upliftMetersPerIteration;
    const K = params.erodibility, hardnessWeight = params.hardnessWeight, m = params.m, dt = params.dt;
    let routings = 0, outlets = 0, incised = 0, bedrockIncised = 0, lifted = 0, creepLowered = 0, creepRaised = 0, subSteps = 0, filledSamples = 0;
    for (let iteration = 0; iteration < params.iterations; iteration++) {
        if (iteration % params.routingEveryIterations === 0) {
            if (state.order) freeArrays(context, ['flood/order']);
            const statistics = fluvialRouting(context, state); routings++; outlets = statistics.outlets; filledSamples = statistics.filledSamples;
            for (let i = 0; i < n; i++) areaFactor[i] = outlet[i] ? 0 : (hardness ? K * (1 - hardnessWeight * hardness[i]) : K) * Math.pow(areaFactor[i], m) * dt / distance[direction[i]];
            memory.free('flood/filled'); context.disown('flood/filled'); state.filled = null;
        }
        context.checkpoint();
        const order = state.order;
        for (let k = 0; k < n; k++) {
            const i = order[k];
            if (outlet[i]) continue;
            // the receiver lies below on the filled surface; where it is higher on the real surface (a pond floor) the stream power is off and only the uplift acts
            const h = heights[i], base = heights[receiver[i]], F = base < h ? areaFactor[i] : 0, lift = upliftMode === 2 ? upliftPerIteration : upliftMode === 1 ? retainRate * (target[i] - h) : 0;
            const change = ((h + lift + F * base) / (1 + F) - h) * (mask ? mask[i] : 1);
            if (change === 0) continue;
            heights[i] = h + change;
            const actual = heights[i] - h;
            if (actual < 0) { wear[i] -= actual; incision[i] -= actual; incised -= actual; bedrockIncised += erodeColumn(column, i, -actual); }
            else { bedrock[i] += actual; lifted += actual; }
        }
        if (state.source) { const creep = diffuse(context, column, state, mask, params.diffusivity, dt); subSteps = creep.subSteps; creepLowered += creep.lowered; creepRaised += creep.raised; }
    }
    let maxIncision = 0, maxWear = 0;
    for (let i = 0; i < n; i++) { if (incision[i] > maxIncision) maxIncision = incision[i]; if (wear[i] > maxWear) maxWear = wear[i]; }
    scope.free('fluvial-incision');
    if (state.order) freeArrays(context, ['flood/order']);
    const final = fluvialRouting(context, state); routings++;
    context.checkpoint();
    const filled = state.filled, land = i => heights[i] >= seaLevel;
    let maxArea = 0;
    for (let i = 0; i < n; i++) { flow[i] = land(i) ? Math.log(areaFactor[i] / spacingX) : 0; if (areaFactor[i] > maxArea) maxArea = areaFactor[i]; }
    const percentiles = robustPercentiles(flow, land, [...FLOW_PERCENTILES], memory, `op/${context.operator.id}/flow-percentiles`).values, range = Math.max(percentiles[1] - percentiles[0], 1e-9);
    const classes = new Int32Array(6), thresholds = [params.channelAreaM2, params.gullyAreaM2, params.rillAreaM2];
    for (let i = 0; i < n; i++) {
        const t = land(i) ? (flow[i] - percentiles[0]) / range : 0;
        flow[i] = t < 0 ? 0 : t > 1 ? 1 : t;
        let kind = DRAINAGE_CLASSES.hillslope;
        if (!land(i)) kind = DRAINAGE_CLASSES.sea;
        else if (filled[i] - heights[i] > params.pondDepthMeters) kind = DRAINAGE_CLASSES.pond;
        else if (areaFactor[i] >= thresholds[0]) kind = DRAINAGE_CLASSES.channel;
        else if (areaFactor[i] >= thresholds[1]) kind = DRAINAGE_CLASSES.gully;
        else if (areaFactor[i] >= thresholds[2]) kind = DRAINAGE_CLASSES.rill;
        drainage[i] = kind; classes[kind]++;
    }
    freeArrays(context, FLOOD_ARRAYS);
    return { iterations: params.iterations, routings, uplift: params.uplift, hardnessApplied: hardness !== null, outlets, filledSamples: final.filledSamples, diffusionSubSteps: subSteps,
        incisedVolumeCubicMeters: round6(incised * cellArea), bedrockIncisedVolumeCubicMeters: round6(bedrockIncised * cellArea), maxIncisionMeters: round6(maxIncision), maxWearMeters: round6(maxWear), liftedVolumeCubicMeters: round6(lifted * cellArea),
        creepLoweredVolumeCubicMeters: round6(creepLowered * cellArea), creepRaisedVolumeCubicMeters: round6(creepRaised * cellArea), maxContributingAreaM2: round6(maxArea), flowLogRange: percentiles.map(round6),
        drainage: { hillslope: classes[0], rill: classes[1], gully: classes[2], channel: classes[3], pond: classes[4], sea: classes[5] }, invariantErrorMeters: round6(columnInvariantError(column, n)), seconds: round6((performance.now() - started) / 1000) };
}

// a droplet deposit on one cell: scaled by the mask, then clamped to the repose plane of the cell's neighbours (the refused share stays in
// the droplet's load, counted as deferred; a cell refusing anything is flagged once); returns what the surface actually took
function depositAt(column, deposition, mask, repose, j, amount, type) {
    if (mask) amount *= mask[j];
    if (amount <= 0) return 0;
    const { heights } = column, { grid, neighbors, tangents } = repose, row = (j / grid.columns) | 0, h = heights[j];
    const room = reposeCeiling(heights, grid, neighbors, row, j - row * grid.columns, j, tangents[type]) - h;
    if (amount > room) {
        repose.deferred += amount - Math.max(0, room);
        if (!repose.limited[j]) { repose.limited[j] = 1; repose.samples++; }
        if (room <= 0) return 0;
        amount = room;
    }
    heights[j] = h + amount;
    const actual = heights[j] - h;
    if (actual <= 0) return 0;
    addDeposit(column, j, type, actual); deposition[j] += actual;
    return actual;
}

function depositCorners(column, deposition, mask, repose, i00, columns, u, v, amount, type) {
    return depositAt(column, deposition, mask, repose, i00, amount * (1 - u) * (1 - v), type) + depositAt(column, deposition, mask, repose, i00 + 1, amount * u * (1 - v), type)
        + depositAt(column, deposition, mask, repose, i00 + columns, amount * (1 - u) * v, type) + depositAt(column, deposition, mask, repose, i00 + columns + 1, amount * u * v, type);
}

// what the brush footprint refused rolls on from the droplet's cell to its lowest neighbour (strictly lower, as the repose plane runs through
// it) and rests wherever a cell has room, for at most ROLL_LIMIT hops: a closed basin keeps its sediment, a slope running off the landscape
// edge loses it (exported); returns what the hops placed
function depositDownhill(column, deposition, mask, repose, grid, row, col, amount, type) {
    const { heights } = column, { columns, rows } = grid, { offset, dr, dc } = repose.neighbors;
    let cell = row * columns + col, remaining = amount, placed = 0;
    for (let hop = 0; hop < ROLL_LIMIT && remaining > 0; hop++) {
        let lowest = heights[cell], next = -1;
        for (let k = 0; k < 8; k++) {
            const r = row + dr[k], c = col + dc[k];
            if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
            const j = cell + offset[k];
            if (heights[j] < lowest) { lowest = heights[j]; next = j; }
        }
        if (next < 0 || slopesOffEdge(heights, grid, repose.neighbors, row, col, cell, lowest)) break;
        cell = next; row = (cell / columns) | 0; col = cell - row * columns;
        const taken = depositAt(column, deposition, mask, repose, cell, remaining, type);
        placed += taken; remaining -= taken;
    }
    return placed;
}

// the end-of-life load a droplet's corners refused spreads over the brush footprint with the brush weights (each cell under the same clamp)
function depositBrush(column, deposition, mask, repose, brush, grid, centerRow, centerColumn, amount, type) {
    const { columns, rows } = grid, { dr, dc, weight, count } = brush;
    let total = 0;
    for (let b = 0; b < count; b++) { const r = centerRow + dr[b], c = centerColumn + dc[b]; if (r >= 0 && c >= 0 && r < rows && c < columns) total += weight[b]; }
    if (total <= 0) return 0;
    let placed = 0;
    for (let b = 0; b < count; b++) {
        const r = centerRow + dr[b], c = centerColumn + dc[b];
        if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
        placed += depositAt(column, deposition, mask, repose, r * columns + c, amount * weight[b] / total, type);
    }
    return placed;
}

function erodeBrush(column, wear, mask, brush, grid, centerRow, centerColumn, amount) {
    const { columns, rows } = grid, { dr, dc, weight, count, radius } = brush, { heights } = column;
    let total = brush.total;
    if (centerRow < radius || centerColumn < radius || centerRow + radius >= rows || centerColumn + radius >= columns) {
        total = 0;
        for (let b = 0; b < count; b++) { const r = centerRow + dr[b], c = centerColumn + dc[b]; if (r >= 0 && c >= 0 && r < rows && c < columns) total += weight[b]; }
        if (total <= 0) return 0;
    }
    let removed = 0;
    for (let b = 0; b < count; b++) {
        const r = centerRow + dr[b], c = centerColumn + dc[b];
        if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
        const j = r * columns + c;
        let take = amount * weight[b] / total;
        if (mask) take *= mask[j];
        if (take <= 0) continue;
        const h = heights[j];
        heights[j] = h - take;
        const actual = h - heights[j];
        if (actual <= 0) continue;
        wear[j] += actual; erodeColumn(column, j, actual); removed += actual;
    }
    return removed;
}

function createBrush(radius) {
    const size = 2 * radius + 1, dr = new Int32Array(size * size), dc = new Int32Array(size * size), weight = new Float64Array(size * size);
    let count = 0, total = 0;
    for (let r = -radius; r <= radius; r++) for (let c = -radius; c <= radius; c++) {
        const d = Math.hypot(r, c);
        if (d >= radius) continue;
        dr[count] = r; dc[count] = c; weight[count] = radius - d; total += radius - d; count++;
    }
    return { radius, dr, dc, weight, count, total };
}

async function hydraulicErosion(context) {
    const started = performance.now(), { params, seed } = context.operator, { grid, seaLevel, layers, scope } = context, { columns, rows, spacingX, spacingZ } = grid, n = columns * rows, cellArea = spacingX * spacingZ;
    const column = geologyColumn(context), { heights } = column, mask = context.mask();
    const wear = layerOf(layers, 'wear', Float32Array), deposition = layerOf(layers, 'deposition', Float32Array);
    const droplets = params.droplets ?? Math.round(params.dropletsPerSquareKilometer * (columns - 1) * spacingX * (rows - 1) * spacingZ / 1e6);
    const brush = createBrush(params.radius), colluviumTangent = Math.tan(params.colluviumSlopeDegrees * DEGREES), depositAtEnd = params.endOfLife === 'deposit';
    // the repose clamp of every corner deposit, by deposit type (colluvium on slopes, alluvium elsewhere)
    const tangents = new Float64Array(7);
    tangents[DEPOSIT_TYPES.colluvium] = Math.tan(params.colluviumReposeDegrees * DEGREES); tangents[DEPOSIT_TYPES.alluvium] = Math.tan(params.alluviumReposeDegrees * DEGREES);
    const repose = { grid, neighbors: neighborTable(grid), tangents, limited: scope.allocate('hydraulic-repose-limited', Uint8Array, n), samples: 0, deferred: 0 };
    const { inertia, capacity, minSlope, erosionRate, depositionRate, evaporation, gravity, maxSteps } = params, keep = 1 - inertia, maxErosion = params.maxErosionPerStepMeters;
    let eroded = 0, deposited = 0, exported = 0, endExported = 0, skippedSea = 0, skippedMask = 0, fates = new Int32Array(4), steps = 0;
    for (let drop = 0; drop < droplets; drop++) {
        if ((drop & 4095) === 0) context.checkpoint();
        let px = hashUnit(seed, drop * 2) * (columns - 1), pz = hashUnit(seed, drop * 2 + 1) * (rows - 1);
        let c = Math.floor(px), r = Math.floor(pz), u = px - c, v = pz - r, i00 = r * columns + c;
        let h00 = heights[i00], h01 = heights[i00 + 1], h10 = heights[i00 + columns], h11 = heights[i00 + columns + 1];
        let h = (h00 * (1 - u) + h01 * u) * (1 - v) + (h10 * (1 - u) + h11 * u) * v;
        if (h < seaLevel) { skippedSea++; continue; }
        if (mask && mask[Math.round(pz) * columns + Math.round(px)] <= 0) { skippedMask++; continue; }
        let dx = 0, dz = 0, speed = params.initialSpeed, water = params.initialWater, sediment = 0, fate = FATE.expired, gx = 0, gz = 0;
        for (let step = 0; step < maxSteps; step++) {
            h00 = heights[i00]; h01 = heights[i00 + 1]; h10 = heights[i00 + columns]; h11 = heights[i00 + columns + 1];
            h = (h00 * (1 - u) + h01 * u) * (1 - v) + (h10 * (1 - u) + h11 * u) * v;
            gx = (h01 - h00) * (1 - v) + (h11 - h10) * v; gz = (h10 - h00) * (1 - u) + (h11 - h01) * u;
            dx = dx * inertia - gx * keep; dz = dz * inertia - gz * keep;
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length === 0) { fate = FATE.stopped; break; }
            dx /= length; dz /= length;
            const nx = px + dx, nz = pz + dz;
            steps++;
            if (nx < 0 || nz < 0 || nx >= columns - 1 || nz >= rows - 1) { fate = FATE.left; break; }
            const nc = Math.floor(nx), nr = Math.floor(nz), nu = nx - nc, nv = nz - nr, j00 = nr * columns + nc;
            const hn = (heights[j00] * (1 - nu) + heights[j00 + 1] * nu) * (1 - nv) + (heights[j00 + columns] * (1 - nu) + heights[j00 + columns + 1] * nu) * nv, dh = hn - h;
            const cap = Math.max(-dh, minSlope) * speed * water * capacity;
            if (sediment > cap || dh > 0) {
                const amount = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * depositionRate;
                if (amount > 0) {
                    const placed = depositCorners(column, deposition, mask, repose, i00, columns, u, v, amount, Math.hypot(gx / spacingX, gz / spacingZ) > colluviumTangent ? DEPOSIT_TYPES.colluvium : DEPOSIT_TYPES.alluvium);
                    sediment -= placed; deposited += placed;
                }
            } else {
                const amount = Math.min((cap - sediment) * erosionRate, -dh, maxErosion);
                if (amount > 0) { const removed = erodeBrush(column, wear, mask, brush, grid, Math.round(pz), Math.round(px), amount); sediment += removed; eroded += removed; }
            }
            speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
            water *= 1 - evaporation;
            px = nx; pz = nz; c = nc; r = nr; u = nu; v = nv; i00 = j00; h = hn;
            if (h < seaLevel) { fate = FATE.sea; break; }
        }
        fates[fate]++;
        if (sediment > 0) {
            // the end-of-life load settles on the corners under the same clamp, then what they refuse spreads over the brush footprint, then
            // rolls downhill; what no cell can hold (mask or repose) leaves with the droplet and is exported, so eroded = deposited + exported holds exactly
            if (fate !== FATE.left && depositAtEnd) {
                const load = sediment, deferredBefore = repose.deferred, type = Math.hypot(gx / spacingX, gz / spacingZ) > colluviumTangent ? DEPOSIT_TYPES.colluvium : DEPOSIT_TYPES.alluvium;
                sediment -= depositCorners(column, deposition, mask, repose, i00, columns, u, v, sediment, type);
                if (sediment > 0) sediment -= depositBrush(column, deposition, mask, repose, brush, grid, Math.round(pz), Math.round(px), sediment, type);
                if (sediment > 0) sediment -= depositDownhill(column, deposition, mask, repose, grid, Math.round(pz), Math.round(px), sediment, type);
                deposited += load - sediment; endExported += sediment;
                // the deferred counter reports what in-flight deposits refused and the droplet carried on; the end-of-life refusals are the export
                repose.deferred = deferredBefore;
            }
            exported += sediment;
        }
    }
    let maxWear = 0, maxDeposit = 0;
    for (let i = 0; i < n; i++) { if (wear[i] > maxWear) maxWear = wear[i]; if (deposition[i] > maxDeposit) maxDeposit = deposition[i]; }
    scope.free('hydraulic-repose-limited');
    return { seed, droplets, steps, skippedBelowSeaLevel: skippedSea, skippedMasked: skippedMask, expired: fates[FATE.expired], leftGrid: fates[FATE.left], stopped: fates[FATE.stopped], enteredSea: fates[FATE.sea], endOfLife: params.endOfLife,
        erodedVolumeCubicMeters: round6(eroded * cellArea), depositedVolumeCubicMeters: round6(deposited * cellArea), exportedVolumeCubicMeters: round6(exported * cellArea), balanceErrorCubicMeters: round6((eroded - deposited - exported) * cellArea),
        reposeLimitedSamples: repose.samples, reposeDeferredVolumeCubicMeters: round6(repose.deferred * cellArea), endOfLifeExportedVolumeCubicMeters: round6(endExported * cellArea),
        maxWearMeters: round6(maxWear), maxDepositionMeters: round6(maxDeposit), invariantErrorMeters: round6(columnInvariantError(column, n)), seconds: round6((performance.now() - started) / 1000) };
}

function reposeTable(params) {
    const table = new Float64Array(7), talus = Math.tan(params.talusReposeDegrees * DEGREES), sand = Math.tan(params.sandReposeDegrees * DEGREES), regolith = Math.tan(params.regolithReposeDegrees * DEGREES);
    table[DEPOSIT_TYPES.none] = regolith; table[DEPOSIT_TYPES.talus] = talus; table[DEPOSIT_TYPES.colluvium] = talus; table[DEPOSIT_TYPES.alluvium] = sand; table[DEPOSIT_TYPES.beachSand] = sand; table[DEPOSIT_TYPES.duneSand] = sand; table[DEPOSIT_TYPES.reefRock] = regolith;
    return table;
}

// steepest descent (tangent) from a sample over its 8 neighbours and the largest repose excess in meters, with virtual neighbours continuing the slope beyond the landscape edge
function steepestLooseDescent(heights, grid, neighbors, row, column, i, tangentRepose, out) {
    const { columns, rows } = grid, { offset, distance, dr, dc } = neighbors, h = heights[i];
    let steepest = 0, excess = 0;
    for (let k = 0; k < 8; k++) {
        const r = row + dr[k], c = column + dc[k];
        let hj;
        if (r < 0 || c < 0 || r >= rows || c >= columns) {
            const ro = row - dr[k], co = column - dc[k];
            if (ro < 0 || co < 0 || ro >= rows || co >= columns) continue;
            hj = 2 * h - heights[ro * columns + co];
        } else hj = heights[i + offset[k]];
        const tangent = (h - hj) / distance[k], e = h - hj - distance[k] * tangentRepose;
        if (tangent > steepest) steepest = tangent;
        if (e > excess) excess = e;
    }
    out[0] = steepest; out[1] = excess;
}

async function thermalWeathering(context) {
    const started = performance.now(), { params } = context.operator, { grid, seaLevel, scope } = context, { columns, rows, spacingX, spacingZ } = grid, n = columns * rows, cellArea = spacingX * spacingZ;
    const column = geologyColumn(context), { heights, bedrock, regolith, depositType, depositThickness } = column, mask = context.mask();
    const neighbors = neighborTable(grid), { offset, distance, dr, dc } = neighbors, tanRepose = reposeTable(params);
    const talusSourceTangent = Math.tan(params.talusSourceSlopeDegrees * DEGREES), weatheringSlope = params.weatheringSlopeDegrees, rate = params.weatheringRateMetersPerIteration, maxRegolith = params.maxRegolithMeters, settleRate = params.settleRate;
    const out = scope.allocate('thermal-out', Float32Array, n), inTalus = scope.allocate('thermal-in-talus', Float64Array, n), inColluvium = scope.allocate('thermal-in-colluvium', Float64Array, n);
    const scale = scope.allocate('thermal-scale', Float64Array, n), limited = scope.allocate('thermal-repose-limited', Uint8Array, n), talusTangent = tanRepose[DEPOSIT_TYPES.talus];
    const excess = new Float64Array(8), drop = new Float64Array(8), target = new Int32Array(8);
    let weathered = 0, moved = 0, exported = 0, talusVolume = 0, colluviumVolume = 0, held = 0, limitedSamples = 0, shedLargest = 0;
    // the over-repose descents of a sample on the current surface: mask-weighted excess, drop and target per neighbour (a virtual neighbour
    // beyond the edge continues the slope, target -1); returns the weight total and leaves the largest excess in shedLargest
    const shedding = (row, col, i) => {
        const tangent = tanRepose[depositThickness[i] > 0 ? depositType[i] : 0], h = heights[i];
        let total = 0;
        shedLargest = 0;
        for (let k = 0; k < 8; k++) {
            excess[k] = 0;
            const r = row + dr[k], c = col + dc[k];
            let hj, j, wj = 1;
            if (r < 0 || c < 0 || r >= rows || c >= columns) {
                const ro = row - dr[k], co = col - dc[k];
                if (ro < 0 || co < 0 || ro >= rows || co >= columns) continue;
                hj = 2 * h - heights[ro * columns + co]; j = -1;
            } else { j = i + offset[k]; hj = heights[j]; if (mask) wj = mask[j]; }
            const dh = h - hj, e = dh - distance[k] * tangent;
            if (e <= 0 || wj <= 0) continue;
            excess[k] = e * wj; drop[k] = dh; target[k] = j; total += e * wj;
            if (e > shedLargest) shedLargest = e;
        }
        return total;
    };
    for (let iteration = 0; iteration < params.iterations; iteration++) {
        context.checkpoint();
        if (rate > 0) {
            for (let row = 0; row < rows; row++) {
                const north = Math.max(0, row - 1), south = Math.min(rows - 1, row + 1);
                for (let col = 0; col < columns; col++) {
                    const i = row * columns + col;
                    if (heights[i] < seaLevel) continue;
                    const w = mask ? mask[i] : 1, room = maxRegolith - regolith[i];
                    if (w <= 0 || room <= 0) continue;
                    let f = 1;
                    if (weatheringSlope > 0) {
                        const west = Math.max(0, col - 1), east = Math.min(columns - 1, col + 1);
                        const gx = (heights[row * columns + east] - heights[row * columns + west]) / ((east - west) * spacingX), gz = (heights[north * columns + col] - heights[south * columns + col]) / ((south - north) * spacingZ);
                        f = (Math.atan(Math.hypot(gx, gz)) / DEGREES - weatheringSlope) / (90 - weatheringSlope);
                        if (f <= 0) continue;
                        if (f > 1) f = 1;
                    }
                    const amount = Math.min(rate * f * w, room);
                    regolith[i] += amount; bedrock[i] -= amount; weathered += amount;
                }
            }
        }
        inTalus.fill(0); inColluvium.fill(0);
        // pass 1: what every sample would shed (out) and the inflow that requests at each in-grid neighbour
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const i = row * columns + col;
                out[i] = 0;
                const loose = regolith[i] + (depositType[i] === DEPOSIT_TYPES.reefRock ? 0 : depositThickness[i]);
                if (loose <= 0) continue;
                const w = mask ? mask[i] : 1;
                if (w <= 0) continue;
                const total = shedding(row, col, i);
                if (total <= 0) continue;
                const amount = Math.min(loose, settleRate * shedLargest) * w;
                if (amount <= 0) continue;
                out[i] = amount;
                for (let k = 0; k < 8; k++) {
                    if (excess[k] <= 0 || target[k] < 0) continue;
                    const share = amount * excess[k] / total;
                    if (drop[k] > distance[k] * talusSourceTangent) inTalus[target[k]] += share; else inColluvium[target[k]] += share;
                }
            }
        }
        // pass 2: a sample takes inflow only up to repose against its highest neighbour as that neighbour stands after shedding (h - out + d tan),
        // so several donors emptying into one hollow cannot stack a needle while material in transit down a face still passes (its upslope
        // donor holds it); the refused share stays at the donors, as a scale factor per receiver
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const j = row * columns + col, inflow = inTalus[j] + inColluvium[j];
                scale[j] = 1;
                if (inflow <= 0) continue;
                let rest = -Infinity;
                for (let k = 0; k < 8; k++) {
                    const r = row + dr[k], c = col + dc[k];
                    if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
                    const m = j + offset[k], level = heights[m] - out[m] + distance[k] * talusTangent;
                    if (level > rest) rest = level;
                }
                const room = rest - heights[j];
                if (inflow <= room) continue;
                const f = room > 0 ? room / inflow : 0;
                scale[j] = f; held += inflow - (room > 0 ? room : 0);
                if (!limited[j]) { limited[j] = 1; limitedSamples++; }
                inTalus[j] *= f; inColluvium[j] *= f;
            }
        }
        // pass 3: the actual movement of every donor is its shares scaled by their receivers; a virtual neighbour beyond the edge takes its whole share (exported)
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const i = row * columns + col, amount = out[i];
                if (amount <= 0) continue;
                const total = shedding(row, col, i);
                let actual = 0;
                for (let k = 0; k < 8; k++) {
                    if (excess[k] <= 0) continue;
                    const share = amount * excess[k] / total, j = target[k];
                    if (j < 0) { exported += share; actual += share; } else actual += share * scale[j];
                }
                out[i] = actual; moved += actual;
            }
        }
        for (let i = 0; i < n; i++) {
            const o = out[i], t = inTalus[i], cIn = inColluvium[i];
            if (o === 0 && t === 0 && cIn === 0) continue;
            if (o > 0) erodeLoose(column, i, o);
            if (t >= cIn) { if (t > 0) addDeposit(column, i, DEPOSIT_TYPES.talus, t); if (cIn > 0) addDeposit(column, i, DEPOSIT_TYPES.colluvium, cIn); }
            else { addDeposit(column, i, DEPOSIT_TYPES.colluvium, cIn); if (t > 0) addDeposit(column, i, DEPOSIT_TYPES.talus, t); }
            talusVolume += t; colluviumVolume += cIn;
            heights[i] = heights[i] - o + t + cIn;
        }
    }
    // convergence is judged on loose-controlled samples (enough loose material to shed a settling step); thinner material above repose is in transit over a bedrock face
    let maxLooseTangent = 0, above = 0, looseSamples = 0, transit = 0;
    const measure = new Float64Array(2);
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const i = row * columns + col, loose = regolith[i] + (depositType[i] === DEPOSIT_TYPES.reefRock ? 0 : depositThickness[i]);
        if (loose <= LOOSE_EPSILON) continue;
        looseSamples++;
        const tangent = tanRepose[depositThickness[i] > 0 ? depositType[i] : 0];
        steepestLooseDescent(heights, grid, neighbors, row, col, i, tangent, measure);
        const exceeds = measure[0] > tangent + REPOSE_TOLERANCE;
        if (exceeds && loose < settleRate * measure[1]) { transit++; continue; }
        if (measure[0] > maxLooseTangent) maxLooseTangent = measure[0];
        if (exceeds) above++;
    }
    return { iterations: params.iterations, weatheredVolumeCubicMeters: round6(weathered * cellArea), movedVolumeCubicMeters: round6(moved * cellArea), talusVolumeCubicMeters: round6(talusVolume * cellArea), colluviumVolumeCubicMeters: round6(colluviumVolume * cellArea),
        exportedVolumeCubicMeters: round6(exported * cellArea), reposeLimitedSamples: limitedSamples, reposeHeldVolumeCubicMeters: round6(held * cellArea), looseSamples, transitSamplesAboveRepose: transit, finalMaxLooseSlopeDegrees: round6(Math.atan(maxLooseTangent) / DEGREES), samplesAboveRepose: above,
        invariantErrorMeters: round6(columnInvariantError(column, n)), seconds: round6((performance.now() - started) / 1000) };
}

// Quinn MFD fractions of flowAccumulation (lower filled neighbours; on a flat the draining equal-level neighbours, else lower-mask flat neighbours)
function routingWeights(filled, flat, flatMask, neighbors, grid, row, column, i, weights) {
    const { columns, rows } = grid, { offset, distance, dr, dc } = neighbors, level = filled[i];
    let total = 0, draining = 0;
    for (let k = 0; k < 8; k++) weights[k] = 0;
    if (!flat[i]) {
        for (let k = 0; k < 8; k++) {
            const r = row + dr[k], c = column + dc[k];
            if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
            const lj = filled[i + offset[k]];
            if (lj < level) { weights[k] = Math.pow((level - lj) / distance[k], FLOW_EXPONENT) * MFD_CONTOUR_FACTOR[k]; total += weights[k]; }
        }
        return total;
    }
    for (let k = 0; k < 8; k++) {
        const r = row + dr[k], c = column + dc[k];
        if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
        const j = i + offset[k];
        if (!flat[j] && filled[j] === level) { weights[k] = MFD_CONTOUR_FACTOR[k] / distance[k]; draining += weights[k]; }
    }
    if (draining > 0) return draining;
    for (let k = 0; k < 8; k++) {
        const r = row + dr[k], c = column + dc[k];
        if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
        const j = i + offset[k];
        if (!flat[j] || filled[j] !== level || flatMask[j] >= flatMask[i]) continue;
        weights[k] = Math.pow((flatMask[i] - flatMask[j]) / distance[k], FLOW_EXPONENT) * MFD_CONTOUR_FACTOR[k]; total += weights[k];
    }
    return total;
}

function depositAlluvium(column, deposition, i, meters) {
    const h = column.heights[i];
    column.heights[i] = h + meters;
    addDeposit(column, i, DEPOSIT_TYPES.alluvium, meters); deposition[i] += meters;
}

// Quinn MFD fractions over the strictly lower real-surface neighbours (inside a filled depression the dry flanks still drain to its floor)
function lakeWeights(heights, neighbors, grid, row, column, i, weights) {
    const { columns, rows } = grid, { offset, distance, dr, dc } = neighbors, h = heights[i];
    let total = 0;
    for (let k = 0; k < 8; k++) {
        weights[k] = 0;
        const r = row + dr[k], c = column + dc[k];
        if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
        const hj = heights[i + offset[k]];
        if (hj < h) { weights[k] = Math.pow((h - hj) / distance[k], FLOW_EXPONENT) * MFD_CONTOUR_FACTOR[k]; total += weights[k]; }
    }
    return total;
}

// connected components of the filled depressions (cells below their filled level, joined at one level); returns the lake count
function labelLakes(grid, filled, heights, label, queue) {
    const { columns, rows } = grid, n = columns * rows;
    label.fill(0);
    let lakes = 0;
    for (let i = 0; i < n; i++) {
        if (label[i] || !(filled[i] > heights[i])) continue;
        const level = filled[i];
        label[i] = ++lakes;
        let head = 0, tail = 0;
        queue[tail++] = i;
        while (head < tail) {
            const cell = queue[head++], row = (cell / columns) | 0, col = cell - row * columns;
            for (let k = 0; k < 8; k++) {
                const r = row + TERRAIN_NEIGHBORS[k][0], c = col + TERRAIN_NEIGHBORS[k][1];
                if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
                const j = r * columns + c;
                if (label[j] || filled[j] !== level || !(filled[j] > heights[j])) continue;
                label[j] = lakes; queue[tail++] = j;
            }
        }
    }
    return lakes;
}

// the flat-resolution order with every lake's cells moved behind the other cells of its level and sorted by descending real height
function lakeRoutingOrder(filled, heights, label, processing, order, scratch, n) {
    let at = 0;
    for (let start = 0; start < n;) {
        const level = filled[processing[start]];
        let end = start, lakeCells = 0;
        while (end < n && filled[processing[end]] === level) { const i = processing[end++]; if (label[i]) scratch[lakeCells++] = i; else order[at++] = i; }
        if (lakeCells) {
            const cells = scratch.subarray(0, lakeCells);
            cells.sort((a, b) => heights[b] - heights[a] || a - b);
            order.set(cells, at); at += lakeCells;
        }
        start = end;
    }
}

// fills a lake from its floor with the trapped volume (cells sorted by ascending current height) up to the spill level; returns what settled and what overflows
function pourLake(column, deposition, cells, start, count, volume, spill, cellArea) {
    const { heights } = column, h = k => heights[cells[start + k]];
    let remaining = volume / cellArea, deepest = 0;
    if (count === 0 || h(0) >= spill) return { poured: 0, overflow: volume, deepest };
    let filled = 1, level = h(0);
    while (filled < count && h(filled) < spill && remaining >= (h(filled) - level) * filled) { remaining -= (h(filled) - level) * filled; level = h(filled); filled++; }
    if (filled < count && h(filled) < spill) { level += remaining / filled; remaining = 0; }
    else {
        const toSpill = (spill - level) * filled;
        if (remaining >= toSpill) { remaining -= toSpill; level = spill; } else { level += remaining / filled; remaining = 0; }
    }
    for (let k = 0; k < filled; k++) {
        const i = cells[start + k], meters = level - heights[i];
        if (meters <= 0) continue;
        depositAlluvium(column, deposition, i, meters);
        if (meters > deepest) deepest = meters;
    }
    return { poured: volume - remaining * cellArea, overflow: remaining * cellArea, deepest };
}

// the lake's spill: the lowest-index draining cell (or outlet) at the lake's level touching it; its receivers lie below the level
function lakeExit(grid, filled, flat, label, cells, start, count) {
    const { columns, rows } = grid, level = filled[cells[start]];
    let exit = -1;
    for (let k = 0; k < count; k++) {
        const i = cells[start + k], row = (i / columns) | 0, col = i - row * columns;
        for (let d = 0; d < 8; d++) {
            const r = row + TERRAIN_NEIGHBORS[d][0], c = col + TERRAIN_NEIGHBORS[d][1];
            if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
            const j = r * columns + c;
            if (!label[j] && !flat[j] && filled[j] === level && (exit < 0 || j < exit)) exit = j;
        }
    }
    return exit;
}

async function sedimentDeposit(context) {
    const started = performance.now(), { params } = context.operator, { grid, seaLevel, scope, layers, memory } = context, { columns, rows, spacingX, spacingZ } = grid, n = columns * rows, cellArea = spacingX * spacingZ;
    const column = geologyColumn(context), { heights, regolith, depositType, depositThickness } = column, mask = context.mask();
    const deposition = layerOf(layers, 'deposition', Float32Array), supply = params.supplyLayer === 'wear' && layers.has('wear') ? layers.get('wear') : null;
    const neighbors = neighborTable(grid), { offset, distance, dr, dc } = neighbors, weights = new Float64Array(8);
    const outlet = scope.allocate('sediment-outlet', Uint8Array, n), flux = scope.allocate('sediment-flux', Float64Array, n), label = scope.allocate('sediment-lake', Int32Array, n), order = scope.allocate('sediment-order', Int32Array, n), scratch = scope.allocate('sediment-scratch', Int32Array, n);
    // lake cells route over the surface frozen at the start of the pass, so deposits laid during the pass cannot reorder the drainage
    const surface = scope.allocate('sediment-surface', Float32Array, n), limited = scope.allocate('sediment-repose-limited', Uint8Array, n), alluviumTangent = Math.tan(params.alluviumReposeDegrees * DEGREES);
    const { capacityCoefficient, capacityAreaExponent, capacitySlopeExponent, minSlope, depositionFraction, mobileFraction, supplyFraction } = params;
    let supplied = 0, entrained = 0, deposited = 0, pond = 0, overflow = 0, strandedOverflow = 0, exported = 0, maxDeposit = 0, outlets = 0, lakes = 0, reposeLimited = 0, reposeDeferred = 0;
    for (let pass = 0; pass < params.iterations; pass++) {
        context.checkpoint();
        outlets = markOutlets(grid, heights, seaLevel, outlet);
        const flood = priorityFlood(grid, heights, outlet, memory); ownArrays(context, FLOOD_ARRAYS);
        const flats = resolveFlats(grid, flood, memory); ownArrays(context, FLATS_ARRAYS);
        freeArrays(context, ['flood/order']);
        const flow = flowAccumulation(grid, flood, flats, FLOW_EXPONENT, memory); ownArrays(context, FLOW_ARRAYS);
        context.checkpoint();
        const { filled } = flood, { flat, mask: flatMask, processing } = flats, area = flow.area;
        surface.set(heights);
        lakes = labelLakes(grid, filled, surface, label, scratch);
        lakeRoutingOrder(filled, surface, label, processing, order, scratch, n);
        // lake buckets (cells grouped by lake, masked-out floor cells excluded) in scratch; a bucket is sorted by current height when its lake is poured
        const counts = new Int32Array(lakes + 2), trapped = new Float64Array(lakes + 1), poured = new Uint8Array(lakes + 1);
        for (let i = 0; i < n; i++) if (label[i] && (!mask || mask[i] > 0)) counts[label[i] + 1]++;
        for (let l = 1; l <= lakes; l++) counts[l + 1] += counts[l];
        const cursor = Int32Array.from(counts);
        for (let i = 0; i < n; i++) if (label[i] && (!mask || mask[i] > 0)) scratch[cursor[label[i]]++] = i;
        flux.fill(0);
        let groupLakeStart = -1;
        for (let k = 0; k < n; k++) {
            const i = order[k], w = mask ? mask[i] : 1, lake = label[i];
            cell: {
                let q = flux[i];
                if (supply && w > 0) { const s = supplyFraction * supply[i] * cellArea * w; q += s; supplied += s; }
                if (outlet[i]) { exported += q; break cell; }
                const row = (i / columns) | 0, col = i - row * columns;
                const total = lake ? lakeWeights(surface, neighbors, grid, row, col, i, weights) : routingWeights(filled, flat, flatMask, neighbors, grid, row, col, i, weights);
                if (lake && total <= 0) { trapped[lake] += q; break cell; }
                if (total <= 0) throw new Error(`[Synthesis] operator ${context.operator.id}: sample ${col},${row} has no drainage after flat resolution`);
                if (w > 0) {
                    let steepest = 0;
                    if (lake || !flat[i]) {
                        const reference = lake ? surface : filled, h = reference[i];
                        for (let j = 0; j < 8; j++) {
                            const r = row + dr[j], c = col + dc[j];
                            if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
                            const hj = reference[i + offset[j]];
                            if (hj < h) { const s = (h - hj) / distance[j]; if (s > steepest) steepest = s; }
                        }
                    }
                    const c = capacityCoefficient * Math.pow(area[i], capacityAreaExponent) * Math.pow(Math.max(steepest, minSlope), capacitySlopeExponent) * spacingX;
                    if (q > c) {
                        // the excess settles as alluvium, but never above the repose plane of the neighbours (a flat-capacity cell at a pond or
                        // channel entrance would otherwise take meters in one go); what the sample cannot hold stays in the flux downstream
                        const excess = (q - c) * depositionFraction * w;
                        if (excess > 0) {
                            const room = Math.max(0, reposeCeiling(heights, grid, neighbors, row, col, i, alluviumTangent) - heights[i]) * cellArea, placed = excess < room ? excess : room;
                            if (placed < excess) { reposeDeferred += excess - placed; if (!limited[i]) { limited[i] = 1; reposeLimited++; } }
                            if (placed > 0) { q -= placed; deposited += placed; depositAlluvium(column, deposition, i, placed / cellArea); if (placed / cellArea > maxDeposit) maxDeposit = placed / cellArea; }
                        }
                    } else {
                        const loose = regolith[i] + (depositType[i] === DEPOSIT_TYPES.reefRock ? 0 : depositThickness[i]), room = Math.min(c - q, mobileFraction * loose * cellArea) * w;
                        if (room > 0) {
                            const removed = erodeLoose(column, i, room / cellArea);
                            heights[i] -= removed; q += removed * cellArea; entrained += removed * cellArea;
                        }
                    }
                }
                if (q <= 0) break cell;
                for (let j = 0; j < 8; j++) if (weights[j] > 0) flux[i + offset[j]] += q * weights[j] / total;
            }
            if (!lake) continue;
            if (groupLakeStart < 0) groupLakeStart = k;
            if (k + 1 < n && filled[order[k + 1]] === filled[i]) continue;
            // the last lake cell of this level: pour the level's lakes from their floors; what overflows a full lake continues from its spill into the lower levels
            for (let g = groupLakeStart; g <= k; g++) {
                const l = label[order[g]];
                if (poured[l]) continue;
                poured[l] = 1;
                if (!(trapped[l] > 0)) continue;
                const start = counts[l], count = counts[l + 1] - start;
                let surplus = trapped[l];
                if (count > 0) {
                    scratch.subarray(start, start + count).sort((a, b) => heights[a] - heights[b] || a - b);
                    const result = pourLake(column, deposition, scratch, start, count, trapped[l], filled[scratch[start]], cellArea);
                    pond += result.poured; deposited += result.poured; surplus = result.overflow;
                    if (result.deepest > maxDeposit) maxDeposit = result.deepest;
                }
                if (!(surplus > 0)) continue;
                overflow += surplus;
                const exit = lakeExit(grid, filled, flat, label, scratch, start, count);
                if (exit < 0) { exported += surplus; strandedOverflow += surplus; continue; }
                if (outlet[exit]) { exported += surplus; continue; }
                const row = (exit / columns) | 0, col = exit - row * columns, total = routingWeights(filled, flat, flatMask, neighbors, grid, row, col, exit, weights);
                if (total <= 0) throw new Error(`[Synthesis] operator ${context.operator.id}: lake spill ${col},${row} has no receiver`);
                for (let j = 0; j < 8; j++) if (weights[j] > 0) flux[exit + offset[j]] += surplus * weights[j] / total;
            }
            groupLakeStart = -1;
        }
        freeArrays(context, ['flood/filled', ...FLATS_ARRAYS, ...FLOW_ARRAYS]);
    }
    let depositedSamples = 0;
    for (let i = 0; i < n; i++) if (deposition[i] > 0) depositedSamples++;
    return { passes: params.iterations, outlets, lakes, supplyApplied: supply !== null, suppliedVolumeCubicMeters: round6(supplied), entrainedVolumeCubicMeters: round6(entrained), depositedVolumeCubicMeters: round6(deposited), pondVolumeCubicMeters: round6(pond),
        lakeOverflowVolumeCubicMeters: round6(overflow), strandedOverflowVolumeCubicMeters: round6(strandedOverflow), exportedVolumeCubicMeters: round6(exported), balanceErrorCubicMeters: round6(supplied + entrained - deposited - exported), maxDepositMeters: round6(maxDeposit), depositedSamples,
        reposeLimitedSamples: reposeLimited, reposeDeferredVolumeCubicMeters: round6(reposeDeferred), invariantErrorMeters: round6(columnInvariantError(column, n)), seconds: round6((performance.now() - started) / 1000) };
}

export const EROSION_OPERATORS = Object.freeze({ 'fluvial-erosion': fluvialErosion, 'hydraulic-erosion': hydraulicErosion, 'thermal-weathering': thermalWeathering, 'sediment-deposit': sedimentDeposit });
