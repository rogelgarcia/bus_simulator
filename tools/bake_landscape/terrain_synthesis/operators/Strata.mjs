// Implements the geology operators strata (dipping layered rock stack with hardness) and terraces (benches cut along hard strata) and the shared geology ledger.
// @ts-check
// Stratification is a world-anchored function of position: the stack level of a sample is its rock height minus the datum (dip planes,
// an offset and a low-frequency warp from the bit-exact LandscapeSurfaceNoise octaves), so a window with a halo reproduces the global
// strata bit for bit. Thickness and hardness cycle through declared patterns, which keeps the catalog data-driven instead of carrying
// per-stratum tables. The geology ledger shared with the erosion and coastal operators keeps height === bedrock + regolith +
// depositThickness: a rise adds a deposit of the operator's type, a fall removes deposits first, then regolith, then bedrock, and a
// sand veneer takes its minimum thickness from the rock below. Terraces follow the mesa/cuesta rule: where a soft stratum rests on a
// hard one on a slope, the soft rock above the hard top within the bench width is cut down to that top and the cut rock is routed
// downslope as talus (Musgrave 1989 thermal weathering deposits), so mass is conserved and the slope histogram becomes bimodal.
import { createLandscapeNoiseOctaves } from '../../../../src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { smoothstep, terrainGradient } from '../../terrain_fields/TerrainFieldsGrid.mjs';

const DEGREES = Math.PI / 180, TALUS = 1, WALK_LIMIT = 512;
const round6 = value => Math.round(value * 1e6) / 1e6;
const modulo = (value, period) => ((value % period) + period) % period;

/**
 * The geology layers of the working grid, created from the current height when absent (bedrock = height, nothing weathered or
 * deposited), with the invariant-keeping surface update shared by every operator that moves rock or sediment.
 * @param {any} context operator context
 */
export function geologyLedger(context) {
    const { layers } = context, heights = layers.get('height'), created = [];
    const ensure = (name, Type, fill) => {
        if (layers.has(name)) return layers.get(name);
        const array = layers.create(name, Type);
        if (fill === 'height') array.set(heights); else if (fill) array.fill(fill);
        created.push(name);
        return array;
    };
    const bedrock = ensure('bedrock', Float32Array, 'height'), regolith = ensure('regolith', Float32Array, 0), depositType = ensure('depositType', Uint8Array, 0), depositThickness = ensure('depositThickness', Float32Array, 0);
    return Object.freeze({
        heights, bedrock, regolith, depositType, depositThickness, created,
        /** Moves the surface of sample i to `next`: a rise deposits material of type `fill`, a fall removes deposits, then regolith, then bedrock. */
        set(i, next, fill) {
            const previous = heights[i];
            heights[i] = next;
            const delta = heights[i] - previous;
            if (delta > 0) { depositThickness[i] += delta; depositType[i] = fill; }
            else if (delta < 0) {
                let remaining = -delta;
                const deposit = Math.min(depositThickness[i], remaining);
                depositThickness[i] -= deposit; remaining -= deposit;
                if (depositThickness[i] <= 0) { depositThickness[i] = 0; depositType[i] = 0; }
                const mantle = Math.min(regolith[i], remaining);
                regolith[i] -= mantle; remaining -= mantle;
                bedrock[i] -= remaining;
            }
            return delta;
        },
        /** Guarantees a loose cover of type `fill` at least `minimum` thick without moving the surface: the shortfall comes from regolith, then bedrock. */
        veneer(i, minimum, fill) {
            const shortfall = minimum - depositThickness[i];
            depositType[i] = fill;
            if (shortfall <= 0) return 0;
            const mantle = Math.min(regolith[i], shortfall);
            regolith[i] -= mantle; bedrock[i] -= shortfall - mantle; depositThickness[i] = minimum;
            return shortfall;
        }
    });
}

/**
 * World-anchored stratification geometry shared by strata and terraces. Stack level = rock height - datum(x, z); stratum k of a cycle
 * spans [starts[k], starts[k + 1]) of the period; indices continue across cycles (negative below the origin).
 * @param {number} seed operator seed @param {{origin:number[],dipEastMetersPerKm:number,dipNorthMetersPerKm:number,offsetMeters:number,thicknessMeters:number,thicknessPattern:number[],warpMeters:number,warpWavelengthMeters:number,hardnessPattern:number[],hardnessNoise?:number,hardnessNoiseWavelengthMeters?:number}} params
 */
export function createStrataGeometry(seed, params) {
    const thickness = params.thicknessPattern.map(factor => params.thicknessMeters * factor), count = thickness.length, starts = new Float64Array(count + 1);
    for (let k = 0; k < count; k++) starts[k + 1] = starts[k] + thickness[k];
    const period = starts[count], [x0, z0] = params.origin, hardness = params.hardnessPattern, hardnessNoise = params.hardnessNoise ?? 0;
    const warp = params.warpMeters > 0 ? createLandscapeNoiseOctaves({ seed, component: 1, wavelengths: [params.warpWavelengthMeters, params.warpWavelengthMeters / 2.3], amplitudes: [1, .45] }) : null;
    const grain = hardnessNoise > 0 ? createLandscapeNoiseOctaves({ seed, component: 2, wavelengths: [params.hardnessNoiseWavelengthMeters, params.hardnessNoiseWavelengthMeters / 2], amplitudes: [1, .5] }) : null;
    const datum = (x, z) => params.dipEastMetersPerKm * (x - x0) / 1000 + params.dipNorthMetersPerKm * (z - z0) / 1000 + params.offsetMeters - (warp ? params.warpMeters * warp.evaluate(x, z) / warp.amplitude : 0);
    const indexOf = level => {
        const cycle = Math.floor(level / period), residual = level - cycle * period;
        let k = 0;
        while (k + 1 < count && starts[k + 1] <= residual) k++;
        return cycle * count + k;
    };
    const bottomOf = index => { const cycle = Math.floor(index / count); return cycle * period + starts[index - cycle * count]; };
    const topOf = index => { const cycle = Math.floor(index / count); return cycle * period + starts[index - cycle * count + 1]; };
    const patternHardness = index => hardness[modulo(index, hardness.length)];
    const hardnessOf = (index, x, z) => {
        const value = patternHardness(index) + (grain ? hardnessNoise * grain.evaluate(x, z) / grain.amplitude : 0);
        return value < 0 ? 0 : value > 1 ? 1 : value;
    };
    return Object.freeze({ period, count, datum, indexOf, bottomOf, topOf, patternHardness, hardnessOf });
}

async function strata(context) {
    const { params, seed } = context.operator, { grid, layers } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, mask = context.mask();
    const sourceLayer = params.source === 'bedrock' && layers.has('bedrock') ? 'bedrock' : 'height', source = layers.get(sourceLayer), geometry = createStrataGeometry(seed, params);
    const created = [];
    const ensure = (name, Type, fill) => { if (layers.has(name)) return layers.get(name); const array = layers.create(name, Type); if (fill) array.fill(fill); created.push(name); return array; };
    const lithology = ensure('lithology', Uint8Array, 0), hardness = ensure('hardness', Float32Array, .5);
    let minimum = Infinity, maximum = -Infinity, stratified = 0, hardSum = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, w = mask ? mask[i] : 1;
            if (w <= 0) continue;
            const x = minX + column * spacingX, index = geometry.indexOf(source[i] - geometry.datum(x, z)), h = geometry.hardnessOf(index, x, z);
            hardness[i] += w * (h - hardness[i]);
            if (w < .5) continue;
            lithology[i] = 1 + modulo(index, 255);
            stratified++; hardSum += hardness[i];
            if (index < minimum) minimum = index; if (index > maximum) maximum = index;
        }
    }
    return { seed, sourceLayer, periodMeters: round6(geometry.period), strataPerCycle: geometry.count, stratifiedSamples: stratified, strataSeen: stratified ? maximum - minimum + 1 : 0,
        indexRange: stratified ? [minimum, maximum] : null, meanHardness: stratified ? round6(hardSum / stratified) : null, createdLayers: created };
}

// lowest strictly lower 8-neighbor on the reference surface (fixed neighbor order), -1 when the sample is a pit
function descend(grid, ground, i) {
    const { columns, rows } = grid, row = Math.floor(i / columns), column = i % columns;
    let best = -1, lowest = ground[i];
    for (let dr = -1; dr <= 1; dr++) {
        const r = row + dr;
        if (r < 0 || r >= rows) continue;
        for (let dc = -1; dc <= 1; dc++) {
            const c = column + dc;
            if ((!dr && !dc) || c < 0 || c >= columns) continue;
            const j = r * columns + c;
            if (ground[j] < lowest) { lowest = ground[j]; best = j; }
        }
    }
    return best;
}

// routes every cut sample's rock down the steepest descent of the pre-cut surface to the first sample that is not cut, then spreads it
// over the next `spread` samples of the descent with linearly decreasing shares (mass conserved by construction)
function routeTalus(grid, ground, cut, fill, spread) {
    const n = cut.length, chain = new Int32Array(spread);
    let stuck = 0, routed = 0;
    for (let i = 0; i < n; i++) {
        if (!(cut[i] > 0)) continue;
        let j = i, steps = 0;
        while (cut[j] > 0 && steps < WALK_LIMIT) { const next = descend(grid, ground, j); if (next < 0) break; j = next; steps++; }
        if (cut[j] > 0) stuck++;
        let length = 1;
        chain[0] = j;
        for (let s = 1; s < spread; s++) { const next = descend(grid, ground, chain[s - 1]); if (next < 0) break; chain[s] = next; length++; }
        const total = length * (length + 1) / 2;
        for (let s = 0; s < length; s++) fill[chain[s]] += cut[i] * (length - s) / total;
        routed++;
    }
    return { stuck, routed };
}

async function terraces(context) {
    const { params, seed } = context.operator, { grid, scope, memory } = context, { columns, rows, spacingX, spacingZ, minX, maxZ } = grid, n = columns * rows, mask = context.mask();
    const lithology = context.layers.get('lithology'), ledger = geologyLedger(context), heights = ledger.heights, geometry = createStrataGeometry(seed, params);
    const ground = scope.allocate('terrace-ground', Float32Array, n), cut = scope.allocate('terrace-cut', Float32Array, n), prefix = `op/${context.operator.id}/terrace-`;
    ground.set(heights);
    const { dhdx, dhdz } = terrainGradient(grid, ground, memory, prefix);
    const minTangent = Math.tan(params.minSlopeDegrees * DEGREES), bench = params.benchWidthMeters, cellArea = spacingX * spacingZ;
    let benchSamples = 0, cutVolume = 0, maxCut = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        const z = maxZ - row * spacingZ;
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, w = params.strength * (mask ? mask[i] : 1);
            if (w <= 0 || lithology[i] === 0) continue;
            const tangent = Math.hypot(dhdx[i], dhdz[i]);
            if (tangent < minTangent) continue;
            const x = minX + column * spacingX, level = ground[i] - geometry.datum(x, z), index = geometry.indexOf(level);
            if (geometry.patternHardness(index) >= params.hardThreshold || geometry.patternHardness(index - 1) < params.hardThreshold) continue;
            const rise = level - geometry.bottomOf(index), horizontal = rise / tangent;
            if (horizontal > bench) continue;
            const depth = w * rise * (1 - smoothstep(bench * .7, bench, horizontal));
            cut[i] = depth; benchSamples++; cutVolume += depth;
            if (depth > maxCut) maxCut = depth;
        }
    }
    memory.free(`${prefix}dhdx`, `${prefix}dhdz`);
    for (let i = 0; i < n; i++) if (cut[i] > 0) ledger.set(i, ground[i] - cut[i], 0);
    context.checkpoint();
    let talus = { stuck: 0, routed: 0 }, deposited = 0, talusSamples = 0, maxFill = 0;
    if (params.depositTalus && benchSamples > 0) {
        const fill = scope.allocate('terrace-fill', Float64Array, n), spread = Math.max(1, Math.round(params.talusSpreadMeters / Math.min(spacingX, spacingZ)));
        talus = routeTalus(grid, ground, cut, fill, spread);
        for (let i = 0; i < n; i++) {
            if (!(fill[i] > 0)) continue;
            ledger.set(i, heights[i] + fill[i], TALUS);
            deposited += fill[i]; talusSamples++;
            if (fill[i] > maxFill) maxFill = fill[i];
        }
        scope.free('terrace-fill');
    }
    scope.free('terrace-ground', 'terrace-cut');
    return { seed, benchSamples, cutVolumeCubicMeters: round6(cutVolume * cellArea), maxCutMeters: round6(maxCut), depositTalus: params.depositTalus, talusSamples, talusVolumeCubicMeters: round6(deposited * cellArea),
        maxTalusMeters: round6(maxFill), stuckRoutes: talus.stuck, massBalanceCubicMeters: round6((cutVolume - deposited) * cellArea), createdLayers: ledger.created };
}

export const STRATA_OPERATORS = Object.freeze({ strata, terraces });
