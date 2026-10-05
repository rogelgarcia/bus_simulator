// Runs every global terrain analysis on the full native grid and encodes the sixteen v1 channels plus the natural soil labels.
// @ts-check
// Global context first: depressions, flow, horizons, sky view and shore distance are computed over the whole authoritative grid before
// any page is sliced, so page borders never truncate a catchment or a horizon. Normalizations use robust land-only percentiles that
// are recorded in the statistics. Phases are ordered to bound the tracked working set (flow arrays are released before curvature and
// horizons); every array is allocated through TerrainFieldMemory.
import { LANDSCAPE_TERRAIN_FIELD_CHANNELS, encodeLandscapeTerrainField } from '../../../src/app/landscape/LandscapeTerrainFields.js';
import { clamp, gaussianSmooth, robustPercentiles, smoothstep, terrainGradient } from './TerrainFieldsGrid.mjs';
import { flowAccumulation, priorityFlood, resolveFlats } from './TerrainFieldsHydrology.mjs';
import { TERRAIN_HORIZON_STORED_STEPS, horizonScratch, horizonSine, skyViewDirections, skyViewSlice, sweepHorizon } from './TerrainFieldsHorizon.mjs';
import { shoreDistance } from './TerrainFieldsShore.mjs';
import { inferNaturalSoil } from './TerrainFieldsNatural.mjs';

const CHANNEL_INDEX = Object.freeze(Object.fromEntries(LANDSCAPE_TERRAIN_FIELD_CHANNELS.map((definition, i) => [definition.name, i])));
const round6 = value => Math.round(value * 1e6) / 1e6;

function applyImports(field, values, imports, land, n) {
    for (const entry of imports.filter(item => item.field === field)) {
        for (let i = 0; i < n; i++) {
            if (!land(i)) continue;
            const imported = entry.values[i];
            values[i] = clamp(entry.mode === 'replace' ? imported : entry.mode === 'max' ? Math.max(values[i], entry.weight * imported) : values[i] * (1 - entry.weight) + entry.weight * imported, 0, 1);
        }
    }
}

function encode(channels, name, values, n) {
    const definition = LANDSCAPE_TERRAIN_FIELD_CHANNELS[CHANNEL_INDEX[name]], target = channels[CHANNEL_INDEX[name]];
    for (let i = 0; i < n; i++) {
        if (!Number.isFinite(values[i]) && !(definition.curve === 'signed-square' && Math.abs(values[i]) === Infinity)) throw new Error(`[TerrainFields] ${name} is not finite at sample ${i}`);
        target[i] = encodeLandscapeTerrainField(definition, values[i]);
    }
}

function byteSummary(channel, land, n) {
    let landSum = 0, landCount = 0, minimum = 255, maximum = 0;
    for (let i = 0; i < n; i++) {
        minimum = Math.min(minimum, channel[i]); maximum = Math.max(maximum, channel[i]);
        if (land(i)) { landSum += channel[i]; landCount++; }
    }
    return { minimumByte: minimum, maximumByte: maximum, landMeanByte: round6(landCount ? landSum / landCount : 0) };
}

/**
 * @param {{grid:{columns:number,rows:number,spacingX:number,spacingZ:number,minX:number,maxZ:number},heights:Float32Array,cover:Uint8Array,seaLevel:number,
 *   soilIds:string[],coverSoil:Uint8Array,planningCover:Uint8Array,recipe:any,imports?:{field:string,mode:string,weight:number,values:Float32Array}[],
 *   memory:import('./TerrainFieldsGrid.mjs').TerrainFieldMemory,log?:(message:string)=>void}} input coverSoil/planningCover map every cover ID to its soil index / planning flag
 */
export function computeTerrainFields({ grid, heights, cover, seaLevel, soilIds, coverSoil, planningCover, recipe, imports = [], memory, log = () => {} }) {
    const { columns, rows, spacingX } = grid, n = columns * rows, land = i => heights[i] >= seaLevel;
    const channels = LANDSCAPE_TERRAIN_FIELD_CHANNELS.map(definition => memory.allocate(`channel/${definition.name}`, Uint8Array, n));
    const semantic = memory.allocate('semantic-soil', Uint8Array, n), planning = memory.allocate('planning', Uint8Array, n);
    let landSamples = 0;
    for (let i = 0; i < n; i++) {
        semantic[i] = coverSoil[cover[i]]; planning[i] = planningCover[cover[i]];
        if (semantic[i] === 255) throw new Error(`[TerrainFields] Cover ${cover[i]} has no soil mapping`);
        if (land(i)) landSamples++;
    }
    const statistics = { land: { samples: n, landSamples, waterSamples: n - landSamples, seaLevel } };

    memory.enter('gradient');
    const { dhdx, dhdz } = terrainGradient(grid, heights, memory);
    const slope = memory.allocate('slope-degrees', Float32Array, n);
    for (let i = 0; i < n; i++) slope[i] = Math.atan(Math.hypot(dhdx[i], dhdz[i])) * 180 / Math.PI;

    memory.enter('flood');
    log('Priority-Flood of the conditioned surface over the whole native grid');
    // hydrology runs on a lightly smoothed routing surface (removes source terracing finer than about four samples); outlets keep the
    // exact sea mask of the authoritative heights and the landscape edge
    const conditioned = gaussianSmooth(grid, heights, recipe.depressions.conditioningSamples, memory, 'flood/conditioned-f64');
    const levels = memory.allocate('flood/levels', Float32Array, n), outlet = memory.allocate('flood/outlet', Uint8Array, n);
    for (let i = 0; i < n; i++) levels[i] = conditioned[i];
    memory.free('flood/conditioned-f64');
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        outlet[i] = row === 0 || column === 0 || row === rows - 1 || column === columns - 1 || !land(i) ? 1 : 0;
    }
    const flood = priorityFlood(grid, levels, outlet, memory);
    const fillDepth = memory.allocate('fill-depth', Float32Array, n);
    for (let i = 0; i < n; i++) fillDepth[i] = flood.filled[i] - levels[i];
    memory.free('flood/levels');
    memory.enter('flats');
    log('Flat drainage toward lower and away from higher edges');
    const flats = resolveFlats(grid, flood, memory);
    memory.free('flood/order');
    memory.enter('flow');
    log('Multiple-flow-direction accumulation, donors before receivers');
    const flow = flowAccumulation(grid, flood, flats, recipe.flow.exponent, memory);
    memory.free('flats/mask', 'flats/processing', 'flood/outlet');
    // flats (filled ponds and designed level ground) carry sheet flow, not channels: the flow channel fades over them
    const flatShare = gaussianSmooth(grid, flats.flat, recipe.flow.flatSuppressionSamples, memory, 'flow/flat-share');
    memory.free('flats/flat');
    const wetnessIndex = memory.allocate('wetness-index', Float32Array, n), catchment = memory.allocate('log-catchment', Float32Array, n);
    for (let row = 0; row < rows; row++) {
        const north = Math.max(0, row - 1), south = Math.min(rows - 1, row + 1);
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, west = Math.max(0, column - 1), east = Math.min(columns - 1, column + 1);
            const gx = (flood.filled[row * columns + east] - flood.filled[row * columns + west]) / ((east - west) * spacingX);
            const gz = (flood.filled[north * columns + column] - flood.filled[south * columns + column]) / ((south - north) * grid.spacingZ);
            const specific = flow.area[i] / spacingX;
            catchment[i] = Math.log(specific);
            wetnessIndex[i] = Math.log(specific / Math.max(recipe.wetness.minimumTangent, Math.hypot(gx, gz)));
        }
    }
    memory.free('flow/area', 'flood/filled');
    // the wetness index is smoothed over land only (normalized convolution with the land mask), so the shore never mixes in water
    {
        const weighted = memory.allocate('wetness/weighted', Float64Array, n), mask = memory.allocate('wetness/mask', Float64Array, n);
        for (let i = 0; i < n; i++) { mask[i] = land(i) ? 1 : 0; weighted[i] = mask[i] * wetnessIndex[i]; }
        const numerator = gaussianSmooth(grid, weighted, recipe.wetness.smoothingSamples, memory, 'wetness/numerator');
        const denominator = gaussianSmooth(grid, mask, recipe.wetness.smoothingSamples, memory, 'wetness/denominator');
        for (let i = 0; i < n; i++) if (land(i)) wetnessIndex[i] = numerator[i] / denominator[i];
        memory.free('wetness/weighted', 'wetness/mask', 'wetness/numerator', 'wetness/denominator');
    }
    const wetnessRange = robustPercentiles(wetnessIndex, land, recipe.wetness.percentiles, memory, 'percentiles/wetness').values;
    const flowRange = robustPercentiles(catchment, land, recipe.flow.percentiles, memory, 'percentiles/flow').values;
    const wetness = memory.allocate('wetness', Float32Array, n), flowNormal = memory.allocate('flow', Float32Array, n);
    for (let i = 0; i < n; i++) {
        wetness[i] = land(i) ? clamp((wetnessIndex[i] - wetnessRange[0]) / (wetnessRange[1] - wetnessRange[0]), 0, 1) : recipe.wetness.belowSeaLevel;
        flowNormal[i] = land(i) ? clamp((catchment[i] - flowRange[0]) / (flowRange[1] - flowRange[0]), 0, 1) * clamp(1 - flatShare[i], 0, 1) : 0;
    }
    memory.free('wetness-index', 'log-catchment', 'flow/flat-share');
    applyImports('wetness', wetness, imports, land, n); applyImports('flow', flowNormal, imports, land, n);
    encode(channels, 'wetness', wetness, n); encode(channels, 'flow', flowNormal, n);
    statistics.flood = { ...flood.statistics, maximumFillMeters: round6(flood.statistics.maximumFillMeters), flats: flats.statistics,
        routing: { mfdSamples: flow.statistics.mfdSamples, flatInteriorSamples: flow.statistics.flatInteriorSamples, lowEdgeSamples: flow.statistics.lowEdgeSamples },
        wetnessIndexRange: wetnessRange.map(round6), logSpecificCatchmentRange: flowRange.map(round6) };

    memory.enter('curvature');
    log('Multi-scale curvature');
    const convexity = memory.allocate('convexity', Float32Array, n), curvatureScales = [];
    recipe.curvature.scalesSamples.forEach((sigma, s) => {
        const smooth = gaussianSmooth(grid, heights, sigma, memory, `curvature/smooth-${s}`), laplacian = memory.allocate(`curvature/laplacian-${s}`, Float32Array, n);
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
            const i = row * columns + column, center = smooth[i];
            const west = smooth[row * columns + Math.max(0, column - 1)], east = smooth[row * columns + Math.min(columns - 1, column + 1)];
            const north = smooth[Math.max(0, row - 1) * columns + column], south = smooth[Math.min(rows - 1, row + 1) * columns + column];
            laplacian[i] = (west + east - 2 * center) / (spacingX * spacingX) + (north + south - 2 * center) / (grid.spacingZ * grid.spacingZ);
        }
        memory.free(`curvature/smooth-${s}`);
        const magnitude = memory.allocate(`curvature/magnitude-${s}`, Float32Array, n);
        for (let i = 0; i < n; i++) magnitude[i] = Math.abs(laplacian[i]);
        const scale = robustPercentiles(magnitude, land, [recipe.curvature.normalizationPercentile], memory, `percentiles/curvature-${s}`).values[0] || 1;
        memory.free(`curvature/magnitude-${s}`);
        for (let i = 0; i < n; i++) convexity[i] += recipe.curvature.weights[s] * clamp(-laplacian[i] / scale, -1, 1);
        memory.free(`curvature/laplacian-${s}`);
        curvatureScales.push({ sigmaSamples: sigma, laplacianPercentile: round6(scale) });
    });
    encode(channels, 'convexity', convexity, n);

    memory.enter('deposition');
    log('Deposition and rock exposure');
    const flowSmooth = gaussianSmooth(grid, flowNormal, recipe.deposition.flowSmoothingSamples, memory, 'deposition/flow');
    const slopeSmooth = gaussianSmooth(grid, slope, recipe.rock.slopeSmoothingSamples, memory, 'deposition/slope');
    const deposition = memory.allocate('deposition', Float32Array, n), rock = memory.allocate('rock', Float32Array, n);
    const d = recipe.deposition, r = recipe.rock;
    for (let i = 0; i < n; i++) {
        if (!land(i)) { deposition[i] = 0; rock[i] = 0; continue; }
        const concave = d.concavityBase + (1 - d.concavityBase) * smoothstep(d.concavity[0], d.concavity[1], -convexity[i]);
        deposition[i] = clamp(Math.pow(Math.max(0, flowSmooth[i]), d.flowExponent) * (1 - smoothstep(d.slopeDegrees[0], d.slopeDegrees[1], slopeSmooth[i])) * concave
            + d.sinkWeight * smoothstep(d.fillDepthMeters[0], d.fillDepthMeters[1], fillDepth[i]), 0, 1);
    }
    applyImports('deposition', deposition, imports, land, n);
    for (let i = 0; i < n; i++) {
        if (!land(i)) continue;
        rock[i] = clamp(smoothstep(r.slopeDegrees[0], r.slopeDegrees[1], slopeSmooth[i]) * (r.convexBase + (1 - r.convexBase) * Math.max(0, convexity[i]))
            * (1 - r.flowSuppression * flowNormal[i]) * (1 - r.depositionSuppression * deposition[i]), 0, r.maximum);
    }
    applyImports('rockExposure', rock, imports, land, n);
    encode(channels, 'deposition', deposition, n); encode(channels, 'rockExposure', rock, n);
    memory.free('deposition/flow', 'deposition/slope', 'deposition', 'rock', 'fill-depth', 'flow', 'wetness', 'convexity');

    memory.enter('horizon');
    log('Horizon sweeps and facet sky view in sixteen directions');
    const tangents = memory.allocate('horizon/tangents', Float32Array, n), sky = memory.allocate('horizon/sky', Float64Array, n), scratch = horizonScratch(grid);
    const directions = skyViewDirections(grid), horizonStatistics = [];
    for (const direction of directions) {
        sweepHorizon(grid, heights, direction.step, tangents, scratch);
        const cos = Math.cos(direction.azimuth), sin = Math.sin(direction.azimuth), storedIndex = TERRAIN_HORIZON_STORED_STEPS.findIndex(step => step[0] === direction.step[0] && step[1] === direction.step[1]);
        let maximum = 0;
        for (let i = 0; i < n; i++) {
            const length = Math.sqrt(dhdx[i] * dhdx[i] + 1 + dhdz[i] * dhdz[i]);
            sky[i] += direction.weight * skyViewSlice(tangents[i], 1 / length, (-dhdx[i] * cos - dhdz[i] * sin) / length);
            if (tangents[i] > maximum && land(i)) maximum = tangents[i];
        }
        if (storedIndex >= 0) {
            const target = channels[CHANNEL_INDEX[LANDSCAPE_TERRAIN_FIELD_CHANNELS[8 + storedIndex].name]], definition = LANDSCAPE_TERRAIN_FIELD_CHANNELS[8 + storedIndex];
            for (let i = 0; i < n; i++) target[i] = encodeLandscapeTerrainField(definition, horizonSine(tangents[i]));
        }
        horizonStatistics.push({ step: direction.step, azimuthDegrees: round6(direction.azimuth * 180 / Math.PI), weightRadians: round6(direction.weight), stored: storedIndex >= 0,
            maximumLandHorizonDegrees: round6(Math.atan(maximum) * 180 / Math.PI) });
    }
    const skyView = memory.allocate('sky-view', Float32Array, n);
    let skySum = 0, skyMinimum = Infinity;
    for (let i = 0; i < n; i++) {
        skyView[i] = clamp(sky[i] / Math.PI, 0, 1);
        if (land(i)) { skySum += skyView[i]; skyMinimum = Math.min(skyMinimum, skyView[i]); }
    }
    encode(channels, 'skyView', skyView, n);
    memory.free('horizon/tangents', 'horizon/sky', 'sky-view', 'dhdx', 'dhdz');
    statistics.horizon = { directions: horizonStatistics, landMeanSkyView: round6(landSamples ? skySum / landSamples : 0), landMinimumSkyView: round6(Number.isFinite(skyMinimum) ? skyMinimum : 0) };

    memory.enter('shore');
    log('Signed shoreline distance');
    const shore = shoreDistance(grid, heights, seaLevel, memory);
    encode(channels, 'shoreDistance', shore.distance, n);
    encode(channels, 'slope', slope, n);
    statistics.shore = { segments: shore.statistics.segments, maximumAdjacentMeters: round6(shore.statistics.maximumAdjacentMeters), rangeMeters: LANDSCAPE_TERRAIN_FIELD_CHANNELS[CHANNEL_INDEX.shoreDistance].scale };

    memory.enter('natural');
    log('Terrain-driven natural soil inference for planning-only samples');
    const natural = inferNaturalSoil({ grid, heights, seaLevel, semanticSoil: semantic, planning, soilIds, shore: shore.distance, slopeDegrees: slope,
        wetness: channels[CHANNEL_INDEX.wetness], recipe: recipe.naturalSoil, memory });
    memory.free('shore/distance', 'slope-degrees', 'semantic-soil', 'planning');
    statistics.naturalSoil = natural.statistics;
    statistics.channels = Object.fromEntries(LANDSCAPE_TERRAIN_FIELD_CHANNELS.map((definition, i) => [definition.name, byteSummary(channels[i], land, n)]));
    statistics.curvature = { model: 'negative-laplacian-of-gaussian-smoothed-height', scales: curvatureScales, weights: [...recipe.curvature.weights] };
    memory.enter('complete');
    return { channels, naturalSoil: natural.labels, statistics };
}
