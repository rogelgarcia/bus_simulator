// Implements geology-channels: finalizes the L0 geology layers (face mask, flow and drainage, wear and deposition normalization, published ranges, neutral defaults).
// @ts-check
// The operator closes a recipe: the erosion, strata and coastal operators leave meters and raw classes in the layers, and this one turns
// them into the published channel ranges on the final surface. Flow repeats the terrain-fields convention (conditioned routing surface,
// Priority-Flood with FIFO pit queue, Barnes flat resolution, Quinn MFD, ln(A / spacing) over land percentiles, faded over flats) so the
// geology flow and the fields flow agree on one terrain; drainage classes come from the contributing area, with flats and filled pits as
// ponds and the sea as its own class. Regolith and deposit thickness are clamped into their published ranges and the bedrock is re-derived
// from the invariant height = bedrock + regolith + depositThickness (a thicker-than-representable mantle counts as rock); every repair is
// counted. Layers no earlier operator produced are created with their neutral values and reported, so the operator is valid in any recipe
// after import-heights. A mask is refused: a partially finalized channel set is not a publishable state.
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS, LANDSCAPE_GEOLOGY_LAYERS } from '../../../../src/app/landscape/LandscapeGeology.js';
import { LANDSCAPE_SYNTHESIS_LAYERS } from '../../../../src/app/landscape/LandscapeSynthesisOperators.js';
import { clamp, gaussianSmooth, robustPercentiles, smoothstep, terrainGradient } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { flowAccumulation, priorityFlood, resolveFlats } from '../../terrain_fields/TerrainFieldsHydrology.mjs';

const DEGREES = 180 / Math.PI, INVARIANT_TOLERANCE_METERS = 1e-3;
const SCALE = Object.freeze(Object.fromEntries(LANDSCAPE_GEOLOGY_CHANNELS.map(definition => [definition.name, definition.scale])));
const CATEGORY = Object.freeze(Object.fromEntries(LANDSCAPE_GEOLOGY_CATEGORIES.map(definition => [definition.name, definition])));
const DRAINAGE = Object.freeze({ hillslope: 0, rill: 1, gully: 2, channel: 3, flatPond: 4, sea: 5 }), COASTAL_OFFSHORE = 1;
// arrays the hydrology functions allocate by fixed name; freed on the way out so an abort leaves nothing tracked
const HYDROLOGY_ARRAYS = Object.freeze(['flood/filled', 'flood/order', 'flood/closed', 'flood/pit', 'flood/heap-keys', 'flood/heap-ids', 'flats/flat', 'flats/mask', 'flats/label', 'flats/queue', 'flats/height', 'flats/away', 'flats/processing', 'flow/area']);
const round6 = value => Math.round(value * 1e6) / 1e6;

function ensureLayers(context) {
    const defaulted = [], heights = context.layers.get('height');
    for (const name of LANDSCAPE_GEOLOGY_LAYERS) {
        if (context.layers.has(name)) continue;
        const layer = context.layers.create(name, LANDSCAPE_SYNTHESIS_LAYERS[name].type === 'uint8' ? Uint8Array : Float32Array);
        if (name === 'bedrock') layer.set(heights);
        defaulted.push(name);
    }
    return defaulted;
}

function faceMaskFromSlope(context, params) {
    const { grid, memory } = context, { columns, rows } = grid, prefix = `op/${context.operator.id}/face-`, faceMask = context.layers.get('faceMask');
    const { dhdx, dhdz } = terrainGradient(grid, context.layers.get('height'), memory, prefix);
    let faceSamples = 0, fullSamples = 0, maxSlope = 0;
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, slope = Math.atan(Math.hypot(dhdx[i], dhdz[i])) * DEGREES, value = smoothstep(params.faceStartDegrees, params.faceFullDegrees, slope);
            faceMask[i] = value;
            if (value > 0) faceSamples++; if (value >= 1) fullSamples++; if (slope > maxSlope) maxSlope = slope;
        }
    }
    memory.free(`${prefix}dhdx`, `${prefix}dhdz`);
    return { faceStartDegrees: params.faceStartDegrees, faceFullDegrees: params.faceFullDegrees, faceSamples, fullFaceSamples: fullSamples, maxSlopeDegrees: round6(maxSlope) };
}

function drainageHistogram(drainage) {
    const counts = new Array(CATEGORY.drainage.maximum + 1).fill(0);
    for (let i = 0; i < drainage.length; i++) counts[drainage[i]]++;
    return Object.fromEntries(CATEGORY.drainage.labels.map((label, k) => [label, counts[k]]));
}

function recomputeFlow(context, params) {
    const { grid, memory, scope, seaLevel } = context, { columns, rows, spacingX } = grid, n = columns * rows, prefix = `op/${context.operator.id}/`;
    const heights = context.layers.get('height'), flow = context.layers.get('flow'), drainage = context.layers.get('drainage'), land = i => heights[i] >= seaLevel;
    const levels = scope.allocate('routing', Float32Array, n), outlet = scope.allocate('outlet', Uint8Array, n);
    const conditioned = gaussianSmooth(grid, heights, params.flowConditioningSamples, memory, `${prefix}conditioned`);
    for (let i = 0; i < n; i++) levels[i] = conditioned[i];
    memory.free(`${prefix}conditioned`);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        outlet[i] = row === 0 || column === 0 || row === rows - 1 || column === columns - 1 || !land(i) ? 1 : 0;
    }
    context.checkpoint();
    try {
        const flood = priorityFlood(grid, levels, outlet, memory), fillDepth = scope.allocate('fill-depth', Float32Array, n);
        for (let i = 0; i < n; i++) fillDepth[i] = flood.filled[i] - levels[i];
        context.checkpoint();
        const flats = resolveFlats(grid, flood, memory);
        memory.free('flood/order');
        context.checkpoint();
        const accumulation = flowAccumulation(grid, flood, flats, params.flowExponent, memory);
        memory.free('flats/mask', 'flats/processing', 'flood/filled');
        context.checkpoint();
        const flatShare = gaussianSmooth(grid, flats.flat, params.flowFlatSuppressionSamples, memory, `${prefix}flat-share`), catchment = scope.allocate('catchment', Float32Array, n);
        for (let i = 0; i < n; i++) catchment[i] = Math.log(accumulation.area[i] / spacingX);
        const range = robustPercentiles(catchment, land, params.flowPercentiles, memory, `${prefix}flow-percentiles`), [low, high] = range.values;
        if (range.count > 0 && !(high > low)) throw new Error(`[Synthesis] operator ${context.operator.id}: the ln(A / spacing) land percentiles ${params.flowPercentiles.join(' and ')} coincide at ${low}; the surface has no drainage contrast to normalize`);
        for (let row = 0; row < rows; row++) {
            if (row % 64 === 0) context.checkpoint();
            for (let column = 0; column < columns; column++) {
                const i = row * columns + column;
                if (!land(i)) { flow[i] = 0; drainage[i] = DRAINAGE.sea; continue; }
                flow[i] = range.count > 0 ? clamp((catchment[i] - low) / (high - low), 0, 1) * clamp(1 - flatShare[i], 0, 1) : 0;
                const area = accumulation.area[i];
                drainage[i] = flats.flat[i] || fillDepth[i] > params.pondFillMeters ? DRAINAGE.flatPond : area >= params.channelAreaSquareMeters ? DRAINAGE.channel
                    : area >= params.gullyAreaSquareMeters ? DRAINAGE.gully : area >= params.rillAreaSquareMeters ? DRAINAGE.rill : DRAINAGE.hillslope;
            }
        }
        memory.free('flats/flat', 'flow/area', `${prefix}flat-share`);
        scope.free('routing', 'outlet', 'fill-depth', 'catchment');
        return { recomputed: true, exponent: params.flowExponent, conditioningSamples: params.flowConditioningSamples, flatSuppressionSamples: params.flowFlatSuppressionSamples,
            landSamples: range.count, logSpecificCatchmentRange: [round6(low), round6(high)], percentiles: [...params.flowPercentiles],
            flood: { outlets: flood.statistics.outlets, filledSamples: flood.statistics.filledSamples, maximumFillMeters: round6(flood.statistics.maximumFillMeters) },
            flats: flats.statistics, routing: { mfdSamples: accumulation.statistics.mfdSamples, flatInteriorSamples: accumulation.statistics.flatInteriorSamples, lowEdgeSamples: accumulation.statistics.lowEdgeSamples },
            areaThresholdsSquareMeters: { rill: params.rillAreaSquareMeters, gully: params.gullyAreaSquareMeters, channel: params.channelAreaSquareMeters }, pondFillMeters: params.pondFillMeters };
    } finally {
        for (const name of [...HYDROLOGY_ARRAYS, `${prefix}flat-share`]) if (memory.entries.has(name)) memory.free(name);
    }
}

function clampFlow(context) {
    const { seaLevel } = context, heights = context.layers.get('height'), flow = context.layers.get('flow'), drainage = context.layers.get('drainage');
    let clamped = 0, seaRelabeled = 0;
    for (let i = 0; i < flow.length; i++) {
        const value = clamp(flow[i], 0, 1);
        if (value !== flow[i]) clamped++;
        flow[i] = value;
        if (heights[i] < seaLevel && drainage[i] !== DRAINAGE.sea) { drainage[i] = DRAINAGE.sea; seaRelabeled++; }
    }
    return { recomputed: false, clampedSamples: clamped, seaRelabeledSamples: seaRelabeled };
}

// normalizes a cumulative depth layer (meters) into 0..1: declared constant, else the land p99, else the land maximum, else nothing
function normalizeDepth(context, name, declared) {
    const values = context.layers.get(name), heights = context.layers.get('height'), seaLevel = context.seaLevel, land = i => heights[i] >= seaLevel;
    let maximum = 0, landMaximum = 0, negative = 0;
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value < 0) negative++;
        if (value > maximum) maximum = value;
        if (value > landMaximum && land(i)) landMaximum = value;
    }
    const p99 = robustPercentiles(values, land, [99], context.memory, `op/${context.operator.id}/${name}-p99`).values[0];
    const [meters, source] = declared !== null ? [declared, 'declared'] : p99 > 0 ? [p99, 'land-p99'] : landMaximum > 0 ? [landMaximum, 'land-maximum'] : [1, 'none'];
    let saturated = 0;
    for (let i = 0; i < values.length; i++) {
        const unit = values[i] / meters;
        if (unit > 1) saturated++;
        values[i] = clamp(unit, 0, 1);
    }
    return { normalizationMeters: round6(meters), source, landP99Meters: round6(p99), maximumMeters: round6(maximum), negativeSamples: negative, saturatedSamples: saturated };
}

// published ranges for the thickness layers, then the bedrock from the invariant height = bedrock + regolith + depositThickness
function finalizeThickness(context) {
    const heights = context.layers.get('height'), bedrock = context.layers.get('bedrock'), regolith = context.layers.get('regolith'), deposit = context.layers.get('depositThickness');
    let regolithClamped = 0, depositClamped = 0, violations = 0, maxResidual = 0, beyondScale = 0, maxOffset = 0;
    for (let i = 0; i < heights.length; i++) {
        const residual = Math.abs(heights[i] - bedrock[i] - regolith[i] - deposit[i]);
        if (residual > INVARIANT_TOLERANCE_METERS) { violations++; if (residual > maxResidual) maxResidual = residual; }
        const r = clamp(regolith[i], 0, SCALE.regolith), d = clamp(deposit[i], 0, SCALE.depositThickness);
        if (r !== regolith[i]) regolithClamped++;
        if (d !== deposit[i]) depositClamped++;
        regolith[i] = r; deposit[i] = d; bedrock[i] = heights[i] - r - d;
        const offset = r + d;
        if (offset > SCALE.bedrockOffset) beyondScale++;
        if (offset > maxOffset) maxOffset = offset;
    }
    return { regolithClampedSamples: regolithClamped, depositThicknessClampedSamples: depositClamped, invariantViolations: violations, maxInvariantResidualMeters: round6(maxResidual),
        bedrockOffsetBeyondScaleSamples: beyondScale, maxBedrockOffsetMeters: round6(maxOffset), toleranceMeters: INVARIANT_TOLERANCE_METERS };
}

function finalizeCoast(context) {
    const heights = context.layers.get('height'), seaLevel = context.seaLevel, coastalZone = context.layers.get('coastalZone'), waveExposure = context.layers.get('waveExposure');
    let offshoreFilled = 0, exposureClamped = 0;
    for (let i = 0; i < heights.length; i++) {
        if (heights[i] < seaLevel && coastalZone[i] === 0) { coastalZone[i] = COASTAL_OFFSHORE; offshoreFilled++; }
        const value = clamp(waveExposure[i], 0, 1);
        if (value !== waveExposure[i]) exposureClamped++;
        waveExposure[i] = value;
    }
    return { offshoreFilledSamples: offshoreFilled, waveExposureClampedSamples: exposureClamped };
}

function categoryHistograms(context) {
    const result = {};
    for (const definition of LANDSCAPE_GEOLOGY_CATEGORIES) {
        const labels = context.layers.get(definition.name), counts = new Uint32Array(256);
        for (let i = 0; i < labels.length; i++) {
            if (labels[i] > definition.maximum) throw new Error(`[Synthesis] operator ${context.operator.id}: ${definition.name} label ${labels[i]} at sample ${i} exceeds the catalog maximum ${definition.maximum}`);
            counts[labels[i]]++;
        }
        const histogram = {};
        for (let label = 0; label <= definition.maximum; label++) if (counts[label] > 0) histogram[definition.labels ? definition.labels[label] : String(label)] = counts[label];
        result[definition.name] = histogram;
    }
    return result;
}

function channelRanges(context) {
    const heights = context.layers.get('height'), bedrock = context.layers.get('bedrock'), ranges = {};
    for (const definition of LANDSCAPE_GEOLOGY_CHANNELS) {
        const values = definition.name === 'bedrockOffset' ? null : context.layers.get(definition.name);
        let minimum = Infinity, maximum = -Infinity;
        for (let i = 0; i < heights.length; i++) {
            const value = values ? values[i] : heights[i] - bedrock[i];
            if (value < minimum) minimum = value; if (value > maximum) maximum = value;
        }
        ranges[definition.name] = [round6(minimum), round6(maximum)];
    }
    return ranges;
}

async function geologyChannels(context) {
    const { params } = context.operator;
    if (context.operator.mask !== null) throw new Error(`[Synthesis] operator ${context.operator.id}: geology-channels finalizes every sample and does not take a mask`);
    const defaultedLayers = ensureLayers(context);
    context.checkpoint();
    const faceMask = faceMaskFromSlope(context, params);
    context.checkpoint();
    const flow = params.recomputeFlow ? recomputeFlow(context, params) : clampFlow(context);
    context.checkpoint();
    const normalization = { wear: normalizeDepth(context, 'wear', params.wearNormalizationMeters), deposition: normalizeDepth(context, 'deposition', params.depositionNormalizationMeters) };
    context.checkpoint();
    const thickness = finalizeThickness(context), coast = finalizeCoast(context), categories = categoryHistograms(context), ranges = channelRanges(context);
    return { defaultedLayers, faceMask, flow, drainage: drainageHistogram(context.layers.get('drainage')), normalization, thickness, coast, categories, ranges };
}

export const GEOLOGY_OPERATORS = Object.freeze({ 'geology-channels': geologyChannels });
