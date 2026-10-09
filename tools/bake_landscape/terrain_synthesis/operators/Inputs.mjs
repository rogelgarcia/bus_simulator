// Implements the input operators: import-heights (landscape directory or raw float32) and plan-inputs (plan rasterization into layers).
// @ts-check
// import-heights binds the source grid to the recipe grid exactly, records the input hashes that enter the recipe identity and moves
// the heights to the working grid (tent or nearest decimation; cover takes aligned labels and the native cover is kept for the
// output). plan-inputs rasterizes the plan once: district ids (optionally clipped to the land side), the shoreline as a signed
// distance field whose land side is found by probing the middle of the declared landscape edge, the roads with their nearest design
// height, width and index through the exact distance transform, and the corridor, runway and apron polygons. The parsed plan and its
// polyline sets stay on the context for the constraint operators.
import path from 'node:path';
import { authoringHash, readAuthoringFile } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { readTerrainFieldSource } from '../../terrain_fields/TerrainFieldsSource.mjs';
import { decimateCover, decimateHeights } from '../SynthesisWorkingGrid.mjs';
import { createPolylineSet, exactDistanceTransform, polylineSide, rasterizePolylineSet, refineNearestSegments, segmentDistance } from './Distance.mjs';
import { parseSynthesisPlan } from './Plan.mjs';
import { rasterizePolygon } from './Polygons.mjs';

const RAW_LIMIT = 1 << 30, PLAN_LIMIT = 16 << 20;
const round6 = value => Math.round(value * 1e6) / 1e6;

function resolveInputPath(context, relative) {
    const root = context.inputs.root;
    if (typeof root !== 'string' || !root) throw new Error(`[Synthesis] operator ${context.operator.id}: inputs.root is required to resolve ${relative}`);
    return path.resolve(root, relative);
}

function requireSameGrid(context, grid, label) {
    const expected = context.output;
    for (const key of ['columns', 'rows', 'spacingX', 'spacingZ', 'minX', 'maxZ']) {
        if (grid[key] !== expected[key]) throw new Error(`[Synthesis] operator ${context.operator.id}: ${label} grid ${key} ${grid[key]} differs from the recipe grid ${expected[key]}`);
    }
}

async function readLandscapeSource(context) {
    const binding = context.recipe.inputs.landscape, { memory, signal } = context;
    if (context.inputs.readLandscape) return context.inputs.readLandscape(binding, { memory, signal, output: context.output });
    const directory = path.isAbsolute(binding.directory) ? binding.directory : resolveInputPath(context, binding.directory);
    const saved = await readLandscapeFileManifest(directory, 'manifest.json', { signal });
    if (binding.expectedRevision !== null && saved.manifest.revision !== binding.expectedRevision) throw new Error(`[Synthesis] landscape ${directory} is revision ${saved.manifest.revision}, the recipe expects ${binding.expectedRevision}`);
    const source = await readTerrainFieldSource(directory, saved.manifest, memory, { signal });
    return { grid: source.grid, heights: source.heights, cover: source.cover, tracked: ['source/heights', 'source/cover'], sha256: authoringHash(saved.bytes), revision: saved.manifest.revision, seaLevel: saved.manifest.coordinates.seaLevel };
}

async function readRawSource(context) {
    const { params, id } = context.operator, { memory } = context, n = params.columns * params.rows;
    if (params.columns !== context.output.columns || params.rows !== context.output.rows) throw new Error(`[Synthesis] operator ${id}: declared ${params.columns} x ${params.rows} differs from the recipe grid ${context.output.columns} x ${context.output.rows}`);
    const read = async relative => context.inputs.readFile ? context.inputs.readFile(relative) : readAuthoringFile(resolveInputPath(context, relative), RAW_LIMIT, { signal: context.signal });
    const bytes = await read(params.file);
    if (bytes.byteLength !== n * 4) throw new Error(`[Synthesis] operator ${id}: ${params.file} holds ${bytes.byteLength} bytes, ${n * 4} expected for ${params.columns} x ${params.rows} float32 samples`);
    const heights = memory.allocate('source/heights', Float32Array, n), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < n; i++) {
        heights[i] = view.getFloat32(i * 4, true);
        if (!Number.isFinite(heights[i])) throw new Error(`[Synthesis] operator ${id}: ${params.file} sample ${i} is not finite`);
    }
    const cover = memory.allocate('source/cover', Uint8Array, n), inputs = [{ id: 'import/heights', sha256: authoringHash(bytes) }];
    if (params.coverFile !== null) {
        const coverBytes = await read(params.coverFile);
        if (coverBytes.byteLength !== n) throw new Error(`[Synthesis] operator ${id}: ${params.coverFile} holds ${coverBytes.byteLength} bytes, ${n} expected`);
        cover.set(coverBytes);
        inputs.push({ id: 'import/cover', sha256: authoringHash(coverBytes) });
    } else cover.fill(params.coverClass);
    return { grid: context.output, heights, cover, tracked: ['source/heights', 'source/cover'], inputs };
}

async function importHeights(context) {
    const { params } = context.operator, { memory } = context;
    const source = params.source === 'landscape' ? await readLandscapeSource(context) : await readRawSource(context);
    for (const name of source.tracked ?? []) context.own(name);
    requireSameGrid(context, source.grid, 'source');
    if (source.seaLevel !== undefined && source.seaLevel !== context.seaLevel) throw new Error(`[Synthesis] the landscape sea level ${source.seaLevel} differs from recipe.seaLevel ${context.seaLevel}`);
    if (source.sha256) context.recordInput('landscape', source.sha256);
    for (const entry of source.inputs ?? []) context.recordInput(entry.id, entry.sha256);
    const n = source.grid.columns * source.grid.rows;
    let minimum = Infinity, maximum = -Infinity;
    for (let i = 0; i < n; i++) { if (source.heights[i] < minimum) minimum = source.heights[i]; if (source.heights[i] > maximum) maximum = source.heights[i]; }
    context.checkpoint();
    let stride = 1;
    if (context.working.coarse) {
        const height = context.layers.create('height', Float32Array), cover = context.layers.create('cover', Uint8Array);
        stride = decimateHeights(source.grid, source.heights, context.grid, height, params.filter);
        decimateCover(source.grid, source.cover, context.grid, cover);
        memory.free('source/heights'); context.disown('source/heights');
        context.setNative({ grid: source.grid, cover: source.cover, coverName: 'source/cover' });
    } else {
        context.layers.adopt('height', source.heights, 'source/heights'); context.layers.adopt('cover', source.cover, 'source/cover');
        context.setNative({ grid: source.grid, cover: source.cover, coverName: 'source/cover' });
    }
    return { source: params.source, revision: source.revision ?? null, nativeGrid: { columns: source.grid.columns, rows: source.grid.rows, spacingX: source.grid.spacingX, spacingZ: source.grid.spacingZ },
        workingStride: stride, filter: context.working.coarse ? params.filter : 'none', heightRangeMeters: [round6(minimum), round6(maximum)] };
}

async function readPlanFiles(context) {
    const plan = context.recipe.inputs.plan, files = {};
    if (plan.landCover !== null) throw new Error(`[Synthesis] operator ${context.operator.id}: recipe.inputs.plan.landCover decoding arrives with the D2 interchange; set it to null and take the cover from import-heights`);
    for (const name of ['districts', 'roads', 'shoreline', 'beachPoints']) {
        if (context.inputs.planFiles) {
            const value = typeof context.inputs.planFiles === 'function' ? await context.inputs.planFiles(name) : context.inputs.planFiles[name];
            if (value === undefined) throw new Error(`[Synthesis] operator ${context.operator.id}: inputs.planFiles lacks ${name}`);
            files[name] = value;
            context.recordInput(`plan/${name}`, authoringHash(JSON.stringify(value)));
        } else {
            const bytes = await readAuthoringFile(resolveInputPath(context, plan[name]), PLAN_LIMIT, { signal: context.signal });
            files[name] = JSON.parse(bytes.toString('utf8'));
            context.recordInput(`plan/${name}`, authoringHash(bytes));
        }
    }
    return parseSynthesisPlan(files);
}

function edgeProbe(context, side) {
    const { grid } = context, minX = grid.minX, maxX = grid.minX + (grid.columns - 1) * grid.spacingX, maxZ = grid.maxZ, minZ = grid.maxZ - (grid.rows - 1) * grid.spacingZ;
    return side === 'east' ? [maxX, (minZ + maxZ) / 2] : side === 'west' ? [minX, (minZ + maxZ) / 2] : side === 'north' ? [(minX + maxX) / 2, maxZ] : [(minX + maxX) / 2, minZ];
}

function rasterizeShoreline(context, plan, params) {
    const { grid, scope, memory } = context, n = grid.columns * grid.rows, set = createPolylineSet([plan.shoreline]);
    const feature = scope.allocate('shore-feature', Uint8Array, n), featureSegment = scope.allocate('shore-feature-segment', Int32Array, n);
    const written = rasterizePolylineSet(grid, set, feature, featureSegment);
    if (!written) throw new Error('[Synthesis] the design shoreline does not cross the working grid');
    const edt = exactDistanceTransform(grid, feature, memory, `op/${context.operator.id}/shore`);
    const segment = scope.allocate('shore-segment', Int32Array, n), parameter = scope.allocate('shore-parameter', Float32Array, n), shoreSigned = context.layers.create('shoreSigned', Float32Array), landMask = context.layers.create('landMask', Float32Array);
    refineNearestSegments(grid, set, edt.nearest, featureSegment, shoreSigned, segment, parameter);
    edt.release();
    // the land side is the side of the probe at the middle of the declared landscape edge, measured against its exact nearest segment
    const probe = edgeProbe(context, params.landSide), out = new Float64Array(2);
    let best = Infinity, bestSegment = 0, bestT = 0;
    for (let k = 0; k < set.count; k++) { segmentDistance(set, k, probe[0], probe[1], out); if (out[0] < best) { best = out[0]; bestSegment = k; bestT = out[1]; } }
    const probeSide = polylineSide(set, bestSegment, bestT, probe[0], probe[1]);
    if (!(Math.abs(probeSide) > 1e-9)) throw new Error(`[Synthesis] the ${params.landSide} edge probe lies on the design shoreline; choose another landSide`);
    const landSign = probeSide > 0 ? 1 : -1;
    let landSamples = 0;
    for (let row = 0; row < grid.rows; row++) {
        const z = grid.maxZ - row * grid.spacingZ;
        for (let column = 0; column < grid.columns; column++) {
            const i = row * grid.columns + column, x = grid.minX + column * grid.spacingX;
            const land = polylineSide(set, segment[i], parameter[i], x, z) * landSign >= 0;
            shoreSigned[i] = land ? shoreSigned[i] : -shoreSigned[i];
            landMask[i] = land ? 1 : 0;
            if (land) landSamples++;
        }
    }
    scope.free('shore-feature', 'shore-feature-segment', 'shore-segment', 'shore-parameter');
    return { set, landSign, statistics: { segments: set.count, featureSamples: written, landSamples, landFraction: round6(landSamples / n), probe } };
}

/**
 * Rasterizes road polylines with per-vertex heights into the road layers (distance, height, width, index). Shared with constrain-roads.
 * @param {any} context @param {Array<{points:number[][],widthMeters:number,index:number}>} roads polylines with [x, y, z] points (y = height carried)
 */
export function rasterizeRoadLayers(context, roads) {
    const { grid, scope, memory } = context, n = grid.columns * grid.rows, set = createPolylineSet(roads.map(road => road.points));
    const ya = new Float64Array(set.count), yb = new Float64Array(set.count), width = new Float64Array(roads.length), roadIndex = new Int32Array(roads.length);
    let k = 0;
    roads.forEach((road, l) => { width[l] = road.widthMeters; roadIndex[l] = road.index; for (let i = 0; i + 1 < road.points.length; i++, k++) { ya[k] = road.points[i][1]; yb[k] = road.points[i + 1][1]; } });
    const feature = scope.allocate('road-feature', Uint8Array, n), featureSegment = scope.allocate('road-feature-segment', Int32Array, n);
    const written = rasterizePolylineSet(grid, set, feature, featureSegment);
    if (!written) throw new Error('[Synthesis] no plan road crosses the working grid');
    const edt = exactDistanceTransform(grid, feature, memory, `op/${context.operator.id}/road`);
    const segment = scope.allocate('road-segment', Int32Array, n), parameter = scope.allocate('road-parameter', Float32Array, n);
    const layer = name => context.layers.has(name) ? context.layers.get(name) : context.layers.create(name, Float32Array);
    const distance = layer('roadDistance'), height = layer('roadHeight'), widthLayer = layer('roadWidth'), indexLayer = layer('roadIndex');
    refineNearestSegments(grid, set, edt.nearest, featureSegment, distance, segment, parameter);
    edt.release();
    for (let i = 0; i < n; i++) {
        const s = segment[i], t = parameter[i];
        height[i] = ya[s] + (yb[s] - ya[s]) * t; widthLayer[i] = width[set.line[s]]; indexLayer[i] = roadIndex[set.line[s]];
    }
    scope.free('road-feature', 'road-feature-segment', 'road-segment', 'road-parameter');
    return { set, featureSamples: written };
}

async function planInputs(context) {
    const { grid } = context, { params } = context.operator, n = grid.columns * grid.rows;
    const plan = await readPlanFiles(context);
    context.checkpoint();
    const shore = rasterizeShoreline(context, plan, params);
    context.checkpoint();
    const districtId = context.layers.create('districtId', Uint8Array), landMask = context.layers.get('landMask'), districts = {};
    for (const district of [...plan.districts].sort((a, b) => a.id - b.id)) {
        const count = rasterizePolygon(grid, district.polygon, districtId, district.id);
        districts[district.id] = { name: district.name, samples: count, targetMeters: district.targetMeters };
    }
    if (params.clipDistrictsToLand) for (let i = 0; i < n; i++) if (!landMask[i]) districtId[i] = 0;
    context.checkpoint();
    const roads = rasterizeRoadLayers(context, plan.roads);
    context.checkpoint();
    const corridor = context.layers.create('corridorMask', Float32Array), runway = context.layers.create('runwayMask', Float32Array), apron = context.layers.create('apronMask', Float32Array);
    const corridorSamples = plan.beachPoints.corridor ? rasterizePolygon(grid, plan.beachPoints.corridor, corridor, 1) : 0;
    const runwaySamples = params.runwayPolygon ? rasterizePolygon(grid, params.runwayPolygon, runway, 1) : 0;
    const apronSamples = params.apronPolygon ? rasterizePolygon(grid, params.apronPolygon, apron, 1) : 0;
    context.setPlan({ ...plan, geometry: { shoreline: shore.set, landSign: shore.landSign, roads: roads.set, runway: params.runwayPolygon, apron: params.apronPolygon } });
    return { districts, shoreline: shore.statistics, roads: { count: plan.roads.length, featureSamples: roads.featureSamples, segments: roads.set.count }, corridorSamples, runwaySamples, apronSamples,
        beachPoints: plan.beachPoints.points.map(point => ({ name: point.name, x: point.x, y: point.y, z: point.z, footprintMeters: point.footprintMeters })) };
}

export const INPUT_OPERATORS = Object.freeze({ 'import-heights': importHeights, 'plan-inputs': planInputs });
