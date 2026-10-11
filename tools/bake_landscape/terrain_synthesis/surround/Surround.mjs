// Runs the AI 596 D5 far-field surround synthesis: the coastal-v3-surround recipe (2049² at 15.625 m over 32 x 32 km with v3 embedded), the seam metrics against v3 decimated, the review maps with the extent outlined, the receipt and the surround document under the v3 directory.
// @ts-check
// The surround is a render-only saved landscape that continues v3 to the horizon: inside the city extent it carries v3 decimated to
// 15.625 m (the import's embedded placement, tent filter), outside it the recipe's masked operators build the far shoreline, the shelf,
// the hills, the ranges and the valleys. This leaf runs the recipe once, recomputes the decimation independently from the v3 natives
// and requires the surround to equal it bit for bit inside the extent (the embed is never touched by an operator), measures the height
// step across the four extent edges, the land and sea fractions and the far-shoreline continuity at the design shoreline's ends, renders
// the 32 km hillshade, slope, elevation and cover maps with the extent outlined, writes the receipt and, with --publish, the surround
// document through writeSynthesizedLandscape into `<landscape>/surround/` with the `surround` block in its provenance preparation
// (landscape id, revision, manifest hash, extent and the boundary hash of the v3 natives, so a stale surround is detectable). A v3 whose
// revision or manifest changed since the import read it is refused at publish; the canonical v2 directory is refused as a landscape.
import path from 'node:path';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { readTerrainFieldSource } from '../../terrain_fields/TerrainFieldsSource.mjs';
import { executeSynthesisRecipe } from '../SynthesisGraph.mjs';
import { decimateCover, decimateHeights, embedPlacement, synthesisOutputGrid } from '../SynthesisWorkingGrid.mjs';
import { coverTransitionMatrix } from '../operators/LandCover.mjs';
import { needleStatistics } from '../SynthesisAnalysis.mjs';
import { sampleHeight } from '../operators/Landforms.mjs';
import { composeSheet, drawLine, renderCoverMap, renderElevationMap, renderHillshade, renderHillshadeWindow, renderMultidirectionalHillshade, renderSlopeMap, rgbOf, writeReviewPng } from '../SynthesisReview.mjs';
import { farShorelineCoast, farShorelineHeadlands, promontoryFootprintCenterX, recipePromontories } from './plan/author.mjs';
import { renderProfilePlot } from '../SynthesisReview.mjs';
import { writeSynthesizedLandscape } from '../SynthesisLandscape.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { acquireAuthoringLock, authoringHash } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { validateLandscapeSynthesisRecipe } from '../../../../src/app/landscape/index.js';
import { LANDSCAPE_DEFAULT_DIRECTORY } from '../../../../src/app/landscape/LandscapeCache.js';

export const SURROUND_FORMAT = 'landscape-surround';
export const SURROUND_RECIPE = 'tools/bake_landscape/terrain_synthesis/recipes/coastal-v3-surround.json';
export const SURROUND_LANDSCAPE = 'assets/public/landscape/coastal-city-v3';
export const SURROUND_LANDSCAPE_ID = 'coastal-city-v3-surround';
export const SURROUND_OUTPUT = 'tests/artifacts/screens/landscape/ai596/d5/surround';
/** Subdirectory of the continued landscape that holds the surround document (manifest.json, payloads/). */
export const SURROUND_DIRECTORY = 'surround';
/** 2 GiB for the synthesis ledger (the 4097² v3 source is read once at import; the 2049² operators peak well below the D3 4 km run's 348 MB). */
export const SURROUND_MEMORY_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
const REFERENCE_MEMORY_LIMIT_BYTES = 512 * 1024 * 1024;
const MAP_SIZE = 2048, THUMBNAIL_SIZE = 256, CROP_SIZE = 512, HILLSHADE_EXAGGERATION = 2, EXTENT_OUTLINE = rgbOf('#e62828'), EXTENT_OUTLINE_PIXELS = 2;
/** Review crop windows: 5 km around every cove footprint, 2 km around every spur headland and around the midpoint of every extent edge. */
const PROMONTORY_WINDOW_METERS = 5000, HEADLAND_WINDOW_METERS = 2000, SEAM_WINDOW_METERS = 2000, HEADLAND_CROPS = 4;
/** The NW-11 silhouette check: the eye 800 m above sea level at (-400, 2000) looking east over the ranges. */
export const SKYLINE_EYE = Object.freeze({ x: -400, z: 2000, altitudeMeters: 800, azimuthFromDegrees: 20, azimuthToDegrees: 160, azimuthStepDegrees: .25, rangeMeters: 24000, massifDegrees: .25 });
const seconds = started => (performance.now() - started) / 1000;
const round3 = value => Math.round(value * 1e3) / 1e3;
const round6 = value => Math.round(value * 1e6) / 1e6;

/**
 * SHA-256 of a landscape's native heights along its four boundary rows and columns, float32 little-endian in the order north row west
 * to east, south row west to east, west column north to south, east column north to south (the surround's staleness key).
 * @param {{columns:number,rows:number}} grid @param {Float32Array} heights
 */
export function landscapeBoundaryHash(grid, heights) {
    const { columns, rows } = grid, bytes = Buffer.alloc((2 * columns + 2 * rows) * 4);
    let at = 0;
    const put = value => { bytes.writeFloatLE(value, at); at += 4; };
    for (let column = 0; column < columns; column++) put(heights[column]);
    for (let column = 0; column < columns; column++) put(heights[(rows - 1) * columns + column]);
    for (let row = 0; row < rows; row++) put(heights[row * columns]);
    for (let row = 0; row < rows; row++) put(heights[row * columns + columns - 1]);
    return authoringHash(bytes);
}

const percentiles = values => {
    const sorted = Float64Array.from(values).sort(), pick = p => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
    let sum = 0;
    for (const value of sorted) sum += value;
    return { count: sorted.length, max: round6(sorted[sorted.length - 1]), p90: round6(pick(.9)), p50: round6(pick(.5)), mean: round6(sum / sorted.length) };
};

/**
 * The seam between the embedded extent and the surround: inside the rectangle every height must equal the reference decimation bit for
 * bit (mismatches and the largest difference are reported; the cover differences the land-cover derivation introduced are counted with
 * their transition matrix), and along each extent edge the step between the boundary sample and its first outside neighbour is measured
 * against the step to its inward neighbour.
 * @param {{columns:number,rows:number}} grid @param {Float32Array} heights @param {Uint8Array} cover
 * @param {{column:number,row:number,columns:number,rows:number}} rectangle @param {Float32Array} referenceHeights @param {Uint8Array} referenceCover
 */
export function measureSeam(grid, heights, cover, rectangle, referenceHeights, referenceCover) {
    const { columns } = grid, { column: c0, row: r0, columns: width, rows: height } = rectangle, c1 = c0 + width - 1, r1 = r0 + height - 1;
    let mismatches = 0, maxDifference = 0, worst = null;
    const insideCover = new Uint8Array(width * height);
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
        const i = (r0 + r) * columns + c0 + c, j = r * width + c, difference = Math.abs(heights[i] - referenceHeights[j]);
        insideCover[j] = cover[i];
        if (!Object.is(heights[i], referenceHeights[j])) { mismatches++; if (!(difference <= maxDifference)) { maxDifference = difference; worst = { column: c0 + c, row: r0 + r, surround: heights[i], reference: referenceHeights[j] }; } }
    }
    const transition = coverTransitionMatrix(referenceCover, insideCover);
    const edge = (name, inside, outside, inward) => {
        const steps = [], reference = [];
        for (let k = 0; k < inside.length; k++) { steps.push(Math.abs(heights[outside[k]] - heights[inside[k]])); reference.push(Math.abs(heights[inward[k]] - heights[inside[k]])); }
        return { edge: name, outsideStep: percentiles(steps), insideStep: percentiles(reference) };
    };
    const span = (count, at) => Array.from({ length: count }, (_, k) => at(k));
    const edges = [
        edge('north', span(width, c => r0 * columns + c0 + c), span(width, c => (r0 - 1) * columns + c0 + c), span(width, c => (r0 + 1) * columns + c0 + c)),
        edge('south', span(width, c => r1 * columns + c0 + c), span(width, c => (r1 + 1) * columns + c0 + c), span(width, c => (r1 - 1) * columns + c0 + c)),
        edge('west', span(height, r => (r0 + r) * columns + c0), span(height, r => (r0 + r) * columns + c0 - 1), span(height, r => (r0 + r) * columns + c0 + 1)),
        edge('east', span(height, r => (r0 + r) * columns + c1), span(height, r => (r0 + r) * columns + c1 + 1), span(height, r => (r0 + r) * columns + c1 - 1))];
    return { inside: { samples: width * height, heightMismatches: mismatches, maxAbsoluteDifferenceMeters: round6(maxDifference), worst, coverChangedSamples: transition.changedSamples, coverMatrix: transition.matrix, coverTotals: transition.totals },
        edges, maxOutsideStepMeters: round6(Math.max(...edges.map(entry => entry.outsideStep.max))), maxInsideStepMeters: round6(Math.max(...edges.map(entry => entry.insideStep.max))) };
}

/** Land and sea sample counts of the grid, inside the rectangle and outside it. */
function landSeaFractions(grid, heights, rectangle, seaLevel) {
    const { columns, rows } = grid, { column: c0, row: r0, columns: width, rows: height } = rectangle, c1 = c0 + width - 1, r1 = r0 + height - 1, counts = { all: [0, 0], inside: [0, 0], outside: [0, 0] };
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const land = heights[row * columns + column] >= seaLevel ? 0 : 1, inside = row >= r0 && row <= r1 && column >= c0 && column <= c1;
        counts.all[land]++; counts[inside ? 'inside' : 'outside'][land]++;
    }
    const entry = ([land, sea]) => ({ land, sea, landFraction: round6(land / (land + sea)), seaFraction: round6(sea / (land + sea)) });
    return { all: entry(counts.all), inside: entry(counts.inside), outside: entry(counts.outside) };
}

// the sea-level crossing of a grid row nearest a world x (linear interpolation between the two samples), null without one
function rowCrossing(grid, heights, row, nearX, seaLevel) {
    const { columns, spacingX, minX } = grid;
    let best = null;
    for (let column = 0; column + 1 < columns; column++) {
        const a = heights[row * columns + column], b = heights[row * columns + column + 1];
        if ((a >= seaLevel) === (b >= seaLevel)) continue;
        const x = minX + (column + (seaLevel - a) / (b - a)) * spacingX;
        if (best === null || Math.abs(x - nearX) < Math.abs(best - nearX)) best = x;
    }
    return best;
}

// x of the far shoreline polyline at z (the first segment of the design-ordered line that spans z)
function polylineX(points, z) {
    for (let i = 0; i + 1 < points.length; i++) {
        const [ax, , az] = points[i], [bx, , bz] = points[i + 1];
        if ((az >= z && bz <= z) || (az <= z && bz >= z)) return az === bz ? ax : ax + (bx - ax) * (z - az) / (bz - az);
    }
    return null;
}

/**
 * Far-shoreline continuity at the design shoreline's ends: on the extent's north and south boundary rows (v3 decimated) and on the first
 * rows outside them, the sea-level crossing nearest the design endpoint, the far polyline's x there and their differences.
 */
function shorelineContinuity(grid, heights, rectangle, shoreline, seaLevel) {
    const { spacingZ, maxZ } = grid, { row: r0, rows: height } = rectangle, r1 = r0 + height - 1, points = shoreline.points_xyz_m;
    // the design shoreline's ends are the far polyline's points at the extent's north and south bounds (the design line is embedded verbatim)
    const designEnd = z => { const point = points.find(entry => entry[2] === z); if (!point) throw new Error(`[Surround] the far shoreline has no vertex at the extent bound z ${z}`); return { x: point[0], z }; };
    const ends = [{ end: 'north', insideRow: r0, outsideRow: r0 - 1 }, { end: 'south', insideRow: r1, outsideRow: r1 + 1 }];
    return ends.map(({ end, insideRow, outsideRow }) => {
        const designPoint = designEnd(maxZ - insideRow * spacingZ), inside = rowCrossing(grid, heights, insideRow, designPoint.x, seaLevel), outside = rowCrossing(grid, heights, outsideRow, designPoint.x, seaLevel);
        const outsideZ = maxZ - outsideRow * spacingZ, polyline = polylineX(points, outsideZ);
        return { end, design: designPoint, inside: { z: maxZ - insideRow * spacingZ, crossingX: inside === null ? null : round3(inside) }, outside: { z: outsideZ, crossingX: outside === null ? null : round3(outside), polylineX: polyline === null ? null : round3(polyline) },
            insideToOutsideMeters: inside === null || outside === null ? null : round3(Math.abs(outside - inside)), outsideToPolylineMeters: outside === null || polyline === null ? null : round3(Math.abs(outside - polyline)), insideToDesignMeters: inside === null ? null : round3(Math.abs(inside - designPoint.x)) };
    });
}

/**
 * The skyline seen from an eye above the terrain over a fan of compass azimuths: per azimuth the largest elevation angle of the surface
 * along the ray (marched one spacing at a time to the range or the grid edge) with its distance and height, the angle of the ray's last
 * sample (the far edge the ranges must rise above) and the massifs: runs of azimuths whose skyline stands at least `massifDegrees` above
 * that far-edge angle, with their span, peak and distance. Bilinear heights; angles in degrees, positive above the eye's horizontal.
 * @param {{columns:number,rows:number,spacingX:number,spacingZ:number,minX:number,maxZ:number}} grid @param {Float32Array} heights @param {typeof SKYLINE_EYE} eye
 */
export function skylineProfile(grid, heights, eye) {
    const { spacingX, spacingZ, minX, maxZ } = grid, maxX = minX + (grid.columns - 1) * spacingX, minZ = maxZ - (grid.rows - 1) * spacingZ, step = Math.min(spacingX, spacingZ), DEGREES = 180 / Math.PI;
    const azimuths = [], angles = [], distances = [], peaks = [], edges = [];
    for (let azimuth = eye.azimuthFromDegrees; azimuth <= eye.azimuthToDegrees + 1e-9; azimuth += eye.azimuthStepDegrees) {
        const dx = Math.sin(azimuth / DEGREES), dz = Math.cos(azimuth / DEGREES);
        let best = -Infinity, bestDistance = 0, bestHeight = 0, last = -Infinity;
        for (let distance = step; distance <= eye.rangeMeters; distance += step) {
            const x = eye.x + dx * distance, z = eye.z + dz * distance;
            if (x < minX || x > maxX || z < minZ || z > maxZ) break;
            const height = sampleHeight(grid, heights, x, z), angle = Math.atan2(height - eye.altitudeMeters, distance) * DEGREES;
            last = angle;
            if (angle > best) { best = angle; bestDistance = distance; bestHeight = height; }
        }
        azimuths.push(round3(azimuth)); angles.push(round3(best)); distances.push(round3(bestDistance)); peaks.push(round3(bestHeight)); edges.push(round3(last));
    }
    const massifs = [];
    let open = null;
    for (let k = 0; k <= azimuths.length; k++) {
        const above = k < azimuths.length && angles[k] - edges[k] >= eye.massifDegrees;
        if (above && !open) open = { fromDegrees: azimuths[k], toDegrees: azimuths[k], peakDegrees: angles[k], peakHeightMeters: peaks[k], peakDistanceMeters: distances[k], riseDegrees: angles[k] - edges[k] };
        else if (above) { open.toDegrees = azimuths[k]; if (angles[k] > open.peakDegrees) { open.peakDegrees = angles[k]; open.peakHeightMeters = peaks[k]; open.peakDistanceMeters = distances[k]; } if (angles[k] - edges[k] > open.riseDegrees) open.riseDegrees = angles[k] - edges[k]; }
        else if (open) { massifs.push({ ...open, spanDegrees: round3(open.toDegrees - open.fromDegrees), riseDegrees: round3(open.riseDegrees) }); open = null; }
    }
    const gaps = massifs.slice(1).map((massif, k) => round3(massif.fromDegrees - massifs[k].toDegrees));
    return { eye, azimuths, angles, distances, peakHeights: peaks, farEdgeAngles: edges, massifs, gapsDegrees: gaps, maxDegrees: round3(Math.max(...angles)), maxFarEdgeDegrees: round3(Math.max(...edges)) };
}

/** A square world window of `sizeMeters` (a multiple of the spacing) centred near (x, z) with its edges on grid vertices, kept inside the grid. */
export function alignedWindow(grid, x, z, sizeMeters) {
    const { spacingX, spacingZ } = grid, maxX = grid.minX + (grid.columns - 1) * spacingX, minZ = grid.maxZ - (grid.rows - 1) * spacingZ, half = sizeMeters / 2;
    const minX = Math.min(maxX - sizeMeters, Math.max(grid.minX, grid.minX + Math.round((x - half - grid.minX) / spacingX) * spacingX));
    const top = Math.max(minZ + sizeMeters, Math.min(grid.maxZ, grid.maxZ - Math.round((grid.maxZ - z - half) / spacingZ) * spacingZ));
    return { minX, maxX: minX + sizeMeters, minZ: top - sizeMeters, maxZ: top };
}

// the extent's four edges in the pixel frame of a world window drawn at `size` pixels (edges beyond the window clip at the canvas)
function outlineRectangle(canvas, window, extent, size) {
    const px = x => (x - window.minX) / (window.maxX - window.minX) * (size - 1), py = z => (window.maxZ - z) / (window.maxZ - window.minZ) * (size - 1);
    const x0 = px(extent.minX), x1 = px(extent.maxX), y0 = py(extent.maxZ), y1 = py(extent.minZ);
    drawLine(canvas, x0, y0, x1, y0, EXTENT_OUTLINE, EXTENT_OUTLINE_PIXELS); drawLine(canvas, x0, y1, x1, y1, EXTENT_OUTLINE, EXTENT_OUTLINE_PIXELS);
    drawLine(canvas, x0, y0, x0, y1, EXTENT_OUTLINE, EXTENT_OUTLINE_PIXELS); drawLine(canvas, x1, y0, x1, y1, EXTENT_OUTLINE, EXTENT_OUTLINE_PIXELS);
    return canvas;
}

/** Outlines a world rectangle on a map rendered at `size` pixels over the grid's bounds (the legend strip below is untouched). */
export function outlineExtent(canvas, grid, extent, size) {
    return outlineRectangle(canvas, { minX: grid.minX, maxX: grid.minX + (grid.columns - 1) * grid.spacingX, minZ: grid.maxZ - (grid.rows - 1) * grid.spacingZ, maxZ: grid.maxZ }, extent, size);
}

/** Outlines a world rectangle on a window crop (the crop's own pixel frame). */
export function outlineExtentWindow(canvas, window, extent) {
    return outlineRectangle(canvas, window, extent, canvas.width);
}

async function directoryBytes(directory) {
    const bytes = { total: 0, files: 0, byFolder: {} };
    const walk = async (folder, top) => {
        for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(folder, entry.name), key = top ?? (entry.isDirectory() ? entry.name : '(root)');
            if (entry.isDirectory()) await walk(file, key);
            else if (entry.isFile()) { const size = (await stat(file)).size; bytes.total += size; bytes.files++; bytes.byFolder[key] = (bytes.byFolder[key] ?? 0) + size; }
        }
    };
    await walk(directory, null);
    return bytes;
}

/** Bytes of the written document by kind, from its manifest (native and ancestor channels) and the directory. */
async function landscapeBytes(written, directory) {
    const bytes = { nativeHeight: 0, nativeCover: 0, ancestorHeight: 0, ancestorCover: 0, manifest: 0, payloads: 0, total: 0, onDisk: 0, files: 0 };
    for (const chunk of written.manifest.chunks) {
        const native = chunk.level === written.manifest.grid.maxLevel;
        bytes[native ? 'nativeHeight' : 'ancestorHeight'] += chunk.channels.height.byteLength; bytes[native ? 'nativeCover' : 'ancestorCover'] += chunk.channels.landCover.byteLength;
    }
    bytes.manifest = (await stat(path.join(directory, 'manifest.json'))).size;
    bytes.payloads = bytes.nativeHeight + bytes.nativeCover + bytes.ancestorHeight + bytes.ancestorCover; bytes.total = bytes.payloads + 2 * bytes.manifest;
    const onDisk = await directoryBytes(directory);
    bytes.onDisk = onDisk.total; bytes.files = onDisk.files;
    return bytes;
}

// the v3 manifest as the surround's source: id, revision, manifest hash and bounds; refuses a revision other than the recipe's expectation
async function readSourceLandscape(directory, recipe, signal) {
    const saved = await readLandscapeFileManifest(directory, 'manifest.json', { signal }), manifest = saved.manifest;
    if (recipe.inputs.landscape.expectedRevision !== null && manifest.revision !== recipe.inputs.landscape.expectedRevision) throw new Error(`[Surround] ${directory} is revision ${manifest.revision}; the recipe continues ${recipe.inputs.landscape.expectedRevision} (a stale or foreign landscape is refused)`);
    return { saved, manifest, record: { landscapeId: manifest.id, revision: manifest.revision, manifestSha256: authoringHash(saved.bytes), extent: { minX: manifest.bounds.minX, maxX: manifest.bounds.maxX, minZ: manifest.bounds.minZ, maxZ: manifest.bounds.maxZ } } };
}

/**
 * @param {{root:string,recipeFile?:string,landscapeDirectory?:string,outputRoot:string,publish?:boolean,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function runSurround({ root, recipeFile = SURROUND_RECIPE, landscapeDirectory = SURROUND_LANDSCAPE, outputRoot, publish = false, signal, log = () => {} }) {
    const started = performance.now(), timing = {};
    const recipeBytes = await readFile(path.resolve(root, recipeFile)), recipeSha256 = authoringHash(recipeBytes), declared = validateLandscapeSynthesisRecipe(JSON.parse(recipeBytes.toString('utf8')));
    const directory = path.resolve(root, landscapeDirectory);
    if (directory === path.resolve(root, LANDSCAPE_DEFAULT_DIRECTORY)) throw new Error(`[Surround] ${landscapeDirectory} is the canonical v2 landscape; the surround continues coastal-city-v3 (v2 is immutable and has no surround)`);
    const bound = path.resolve(root, declared.inputs.landscape.directory) === directory, recipe = bound ? declared : validateLandscapeSynthesisRecipe({ ...structuredClone(declared), inputs: { ...structuredClone(declared.inputs), landscape: { ...declared.inputs.landscape, directory: landscapeDirectory } } });
    const importOperator = recipe.operators.find(entry => entry.enabled && entry.op === 'import-heights');
    if (!importOperator || importOperator.params.placement !== 'embed') throw new Error('[Surround] the surround recipe must embed its landscape (import-heights placement embed)');
    const seaLevel = recipe.seaLevel, outputGrid = synthesisOutputGrid(recipe), operatorsDirectory = path.join(outputRoot, 'operators');
    const surroundDirectory = publish ? path.join(directory, SURROUND_DIRECTORY) : path.join(outputRoot, 'landscape');
    await rm(operatorsDirectory, { recursive: true, force: true });
    if (!publish) await rm(surroundDirectory, { recursive: true, force: true });
    await mkdir(operatorsDirectory, { recursive: true });
    log(`[Surround] recipe ${recipe.id} (${recipeSha256.slice(0, 12)}) on ${recipe.grid.columns}² at ${recipe.grid.spacingX} m over ${recipe.grid.bounds.minX}..${recipe.grid.bounds.maxX}; continuing ${directory}; surround -> ${surroundDirectory}`);
    // the source landscape and the independent reference: the boundary hash of the natives and their tent decimation into the extent rectangle
    let mark = performance.now();
    const source = await readSourceLandscape(directory, recipe, signal), referenceMemory = new TerrainFieldMemory(REFERENCE_MEMORY_LIMIT_BYTES);
    const natives = await readTerrainFieldSource(directory, source.manifest, referenceMemory, { signal }), rectangle = embedPlacement(natives.grid, outputGrid), boundaryHash = landscapeBoundaryHash(natives.grid, natives.heights);
    const decimatedGrid = { columns: rectangle.columns, rows: rectangle.rows, spacingX: natives.grid.spacingX * rectangle.factor, spacingZ: natives.grid.spacingZ * rectangle.factor, minX: natives.grid.minX, maxZ: natives.grid.maxZ };
    const referenceHeights = new Float32Array(rectangle.columns * rectangle.rows), referenceCover = new Uint8Array(rectangle.columns * rectangle.rows);
    decimateHeights(natives.grid, natives.heights, decimatedGrid, referenceHeights, importOperator.params.filter ?? 'tent'); decimateCover(natives.grid, natives.cover, decimatedGrid, referenceCover);
    referenceMemory.free('source/heights', 'source/cover');
    timing.referenceSeconds = seconds(mark);
    log(`[Surround] ${source.record.landscapeId} ${source.record.revision} (manifest ${source.record.manifestSha256.slice(0, 12)}, boundary ${boundaryHash.slice(0, 12)}): ${natives.grid.columns}² natives decimated ×${rectangle.factor} into columns ${rectangle.column}..${rectangle.column + rectangle.columns - 1}, rows ${rectangle.row}..${rectangle.row + rectangle.rows - 1} in ${timing.referenceSeconds.toFixed(1)} s`);
    // synthesis
    const memory = new TerrainFieldMemory(SURROUND_MEMORY_LIMIT_BYTES), thumbnails = [], shoreline = JSON.parse(await readFile(path.resolve(root, recipe.inputs.plan.shoreline), 'utf8'));
    mark = performance.now();
    const result = await executeSynthesisRecipe({ recipe, inputs: { root }, memory, signal, log,
        onProgress: event => { if (event.phase === 'done') log(`[Surround] ${event.index + 1}/${event.count} ${event.id} (${event.op}) ${event.seconds.toFixed(1)} s, ${(memory.bytes / 1048576).toFixed(0)} MB tracked (peak ${(memory.peakBytes / 1048576).toFixed(0)} MB), ${seconds(mark).toFixed(0)} s elapsed`); },
        onOperator: async ({ index, id, grid, layers }) => {
            const image = outlineExtent(renderHillshade(grid, layers.get('height'), { size: THUMBNAIL_SIZE, seaLevel, verticalExaggeration: HILLSHADE_EXAGGERATION }), grid, source.record.extent, THUMBNAIL_SIZE), label = `${String(index + 1).padStart(2, '0')} ${id}`;
            thumbnails.push({ image, label });
            await writeReviewPng(path.join(operatorsDirectory, `${String(index + 1).padStart(2, '0')}-${id}.png`), image);
        } });
    timing.synthesisSeconds = seconds(mark);
    try {
        const { report, grid, heights, cover } = result;
        log(`[Surround] engine ${report.totalSeconds.toFixed(1)} s, peak tracked ${(memory.peakBytes / 1048576).toFixed(0)} MB; measuring the seam`);
        mark = performance.now();
        const seam = measureSeam(grid, heights, cover, rectangle, referenceHeights, referenceCover), landSea = landSeaFractions(grid, heights, rectangle, seaLevel), continuity = shorelineContinuity(grid, heights, rectangle, shoreline, seaLevel);
        const needles = needleStatistics(grid, heights, 2);
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < heights.length; i++) { if (heights[i] < min) min = heights[i]; if (heights[i] > max) max = heights[i]; }
        timing.measurementSeconds = seconds(mark);
        const failed = [];
        if (seam.inside.heightMismatches !== 0 || seam.inside.maxAbsoluteDifferenceMeters !== 0) failed.push(`inside-extent heights differ from v3 decimated (${seam.inside.heightMismatches} samples, max ${seam.inside.maxAbsoluteDifferenceMeters} m)`);
        log(`[Surround] seam inside ${seam.inside.heightMismatches} mismatches (max ${seam.inside.maxAbsoluteDifferenceMeters} m, cover changed ${seam.inside.coverChangedSamples}); edge step max ${seam.maxOutsideStepMeters} m (inside steps max ${seam.maxInsideStepMeters} m); land ${(landSea.all.landFraction * 100).toFixed(1)}% (outside ${(landSea.outside.landFraction * 100).toFixed(1)}%); heights ${min.toFixed(1)}..${max.toFixed(1)} m; needles ${needles.count}`);
        for (const end of continuity) log(`[Surround] far shoreline ${end.end}: crossing inside x ${end.inside.crossingX} (design ${end.design.x}), outside x ${end.outside.crossingX} (polyline ${end.outside.polylineX}): inside-outside ${end.insideToOutsideMeters} m, outside-polyline ${end.outsideToPolylineMeters} m`);
        await writeFile(path.join(outputRoot, 'engine-report.json'), JSON.stringify(report, null, 1));
        // review images: the 32 km maps with the extent outlined and the per-operator sheet
        mark = performance.now();
        const images = {}, write = async (name, image) => { const file = path.join(outputRoot, `${name}.png`); await writeReviewPng(file, image); images[name] = file; log(`[Surround] rendered ${name}`); };
        const outlined = image => outlineExtent(image, grid, source.record.extent, MAP_SIZE);
        await write('hillshade', outlined(renderHillshade(grid, heights, { size: MAP_SIZE, seaLevel, verticalExaggeration: HILLSHADE_EXAGGERATION })));
        await write('hillshade-multi', outlined(renderMultidirectionalHillshade(grid, heights, { size: MAP_SIZE, seaLevel, verticalExaggeration: HILLSHADE_EXAGGERATION })));
        await write('slope', outlined(renderSlopeMap(grid, heights, { size: MAP_SIZE, seaLevel, workingLimitBytes: SURROUND_MEMORY_LIMIT_BYTES })));
        await write('elevation', outlined(renderElevationMap(grid, heights, { size: MAP_SIZE, seaLevel, contourIntervalMeters: 20 })));
        await write('cover', outlined(renderCoverMap(grid, cover, { size: MAP_SIZE })));
        await write('operators', composeSheet(thumbnails, { columns: 5 }));
        // crops: every main promontory (5 km) and the midpoint of every extent edge (2 km, the extent outlined), 512 px per window
        const { extent } = source.record, crop = (x, z, meters, label, outline) => {
            const window = alignedWindow(grid, x, z, meters), image = renderHillshadeWindow(grid, heights, { window, size: CROP_SIZE, seaLevel, verticalExaggeration: HILLSHADE_EXAGGERATION });
            return { image: outline ? outlineExtentWindow(image, window, extent) : image, label };
        };
        const coves = recipePromontories(recipe).map(feature => crop(promontoryFootprintCenterX(feature), feature.center[1], PROMONTORY_WINDOW_METERS, `${feature.id} (${feature.kind})`, false));
        if (coves.length) await write('coves', composeSheet(coves, { columns: Math.min(4, coves.length) }));
        // the spur headlands: where the far coast bulges seaward under the spur ridges (the author's displacement, most prominent first)
        const headlands = farShorelineHeadlands(farShorelineCoast(recipe)).slice(0, HEADLAND_CROPS);
        if (headlands.length) {
            await write('headlands', composeSheet(headlands.map(headland => crop(headland.x + HEADLAND_WINDOW_METERS / 4, headland.z, HEADLAND_WINDOW_METERS, `headland z ${headland.z} (${headland.displacementMeters.toFixed(0)} m seaward)`, false)), { columns: Math.min(4, headlands.length) }));
            await write('headland-crop', crop(headlands[0].x + HEADLAND_WINDOW_METERS / 4, headlands[0].z, HEADLAND_WINDOW_METERS, `headland z ${headlands[0].z}`, false).image);
        }
        const midX = (extent.minX + extent.maxX) / 2, midZ = (extent.minZ + extent.maxZ) / 2;
        await write('seams', composeSheet([crop(midX, extent.maxZ, SEAM_WINDOW_METERS, 'north edge', true), crop(midX, extent.minZ, SEAM_WINDOW_METERS, 'south edge', true), crop(extent.minX, midZ, SEAM_WINDOW_METERS, 'west edge', true), crop(extent.maxX, midZ, SEAM_WINDOW_METERS, 'east edge', true)], { columns: 4 }));
        // the NW-11 silhouette: the skyline of the ranges from 800 m over (-400, 2000) looking east, against the far edge of the grid
        const skyline = skylineProfile(grid, heights, SKYLINE_EYE);
        await write('skyline-nw11', renderProfilePlot({ title: `Skyline from (${SKYLINE_EYE.x}, ${SKYLINE_EYE.z}) at ${SKYLINE_EYE.altitudeMeters} m, azimuth ${SKYLINE_EYE.azimuthFromDegrees}..${SKYLINE_EYE.azimuthToDegrees} deg (east = 90)`, verticalExaggeration: 1, seaLevel: 0, xLabel: 'compass azimuth (deg)', yLabel: 'elevation angle (deg)',
            series: [{ label: 'skyline', distance: skyline.azimuths, height: skyline.angles }, { label: 'far edge of the grid', distance: skyline.azimuths, height: skyline.farEdgeAngles }] }));
        log(`[Surround] skyline NW-11: ${skyline.massifs.length} massifs ${skyline.massifs.map(massif => `${massif.fromDegrees}..${massif.toDegrees} deg (${massif.peakHeightMeters.toFixed(0)} m at ${(massif.peakDistanceMeters / 1000).toFixed(1)} km, +${massif.riseDegrees.toFixed(2)} deg)`).join('; ')}; gaps ${skyline.gapsDegrees.join(', ')} deg`);
        timing.renderSeconds = seconds(mark);
        // the surround document: a standalone saved landscape (no references, appearance or fields) with the surround block in its provenance
        mark = performance.now();
        if (publish) {
            const again = await readSourceLandscape(directory, recipe, signal);
            if (again.record.revision !== source.record.revision || again.record.manifestSha256 !== source.record.manifestSha256) throw new Error(`[Surround] ${directory} changed during the run (${source.record.revision} ${source.record.manifestSha256.slice(0, 12)} -> ${again.record.revision} ${again.record.manifestSha256.slice(0, 12)}); the surround is not published`);
        }
        const importStatistics = report.operators[0].statistics, surroundBlock = { ...source.record, boundaryHash };
        const writeDocument = () => writeSynthesizedLandscape({ sourceDirectory: null, outputDirectory: surroundDirectory, grid, heights, cover, id: SURROUND_LANDSCAPE_ID, name: 'Coastal City Terrain v3 far-field surround', revisionLabel: `${recipe.id}-${report.identity.slice(-8)}`,
            provenance: { sourceName: `${recipe.id} continuing ${source.record.landscapeId} ${source.record.revision} (embedded, decimated ×${rectangle.factor} with the ${importOperator.params.filter ?? 'tent'} filter) by landscape-synthesis-v1`,
                preparation: { surround: surroundBlock, importPlacement: importStatistics.importPlacement, workingSpacingMeters: report.working.spacing, renderOnly: true } },
            synthesis: { recipeId: recipe.id, identity: report.identity, recipeSha256, sourceSpacingMeters: report.working.spacing }, references: 'none', appearance: 'none', fields: 'none',
            chunkIntervals: recipe.grid.chunkIntervals, maxLevel: recipe.grid.maxLevel, seaLevel, signal, log });
        log(`[Surround] writing ${SURROUND_LANDSCAPE_ID} to ${surroundDirectory}${publish ? ' under the v3 authoring lock' : ''}`);
        let written;
        if (publish) { const release = await acquireAuthoringLock(directory); try { written = await writeDocument(); } finally { await release(); } }
        else written = await writeDocument();
        timing.landscapeSeconds = seconds(mark);
        const bytes = await landscapeBytes(written, surroundDirectory), build = written.hierarchy.builds[written.hierarchy.builds.length - 1], snapshot = `manifest.${written.manifestSha256}.json`;
        log(`[Surround] ${written.revision} written (${written.manifest.chunks.length} nodes, ${written.files.length} files, ${(bytes.total / 1048576).toFixed(2)} MB by manifest, snapshot ${snapshot}) in ${timing.landscapeSeconds.toFixed(1)} s`);
        const coverStatistics = report.operators.find(entry => entry.op === 'derive-land-cover')?.statistics ?? null;
        timing.totalSeconds = seconds(started);
        const receipt = { format: SURROUND_FORMAT, schemaVersion: 1, passed: failed.length === 0, failed,
            recipe: { file: recipeFile, id: recipe.id, sha256: recipeSha256, identity: report.identity, seed: recipe.seed, grid: recipe.grid, working: report.working, inputs: report.inputs, landscapeDirectoryOverride: bound ? null : landscapeDirectory },
            source: { directory, ...source.record, boundaryHash, nativeGrid: { columns: natives.grid.columns, rows: natives.grid.rows, spacing: natives.grid.spacingX } },
            placement: importStatistics.importPlacement, blendMeters: 300, seam, landSea, continuity, heights: { min: round3(min), max: round3(max) }, needles,
            headlands: headlands.map(headland => ({ ...headland })), skyline: { eye: skyline.eye, maxDegrees: skyline.maxDegrees, maxFarEdgeDegrees: skyline.maxFarEdgeDegrees, massifs: skyline.massifs, gapsDegrees: skyline.gapsDegrees, azimuths: skyline.azimuths, angles: skyline.angles, farEdgeAngles: skyline.farEdgeAngles, peakHeights: skyline.peakHeights, distances: skyline.distances },
            landCover: coverStatistics ? { rules: coverStatistics.rules, decidedByRule: coverStatistics.decidedByRule, samples: coverStatistics.samples, changedSamples: coverStatistics.changedSamples, totals: coverStatistics.totals, matrix: coverStatistics.matrix, outputCover: report.outputCover } : null,
            engine: { operators: report.operators.map(({ id, op, seconds: operatorSeconds }) => ({ id, op, seconds: operatorSeconds })), totalSeconds: report.totalSeconds, outputSeconds: report.outputSeconds, peakTrackedBytes: memory.peakBytes, peakPhase: memory.peakPhase, limitBytes: SURROUND_MEMORY_LIMIT_BYTES,
                shoreline: report.operators.find(entry => entry.op === 'constrain-shoreline')?.statistics ?? null, fluvial: report.operators.find(entry => entry.op === 'fluvial-erosion')?.statistics ?? null, promontories: Object.fromEntries(report.operators.filter(entry => ['landform-headland', 'landform-cove'].includes(entry.op)).map(entry => [entry.id, { kind: entry.statistics.kind, changedSamples: entry.statistics.changedSamples, maxChangeMeters: entry.statistics.maxChangeMeters, shoreline: entry.statistics.shoreline }])) },
            surround: { directory: surroundDirectory, id: SURROUND_LANDSCAPE_ID, published: publish, revision: written.revision, contentRevision: written.contentRevision, manifestSha256: written.manifestSha256, manifestSnapshot: snapshot, heightsSha256: written.heightsSha256, coverSha256: written.coverSha256,
                nodes: written.manifest.chunks.length, nativeChunks: build.nativeChunks, levels: build.levels, files: written.files.length, bytes, timing: written.timing, block: surroundBlock },
            images, timing };
        await writeFile(path.join(outputRoot, 'surround.json'), JSON.stringify(receipt, null, 1));
        await writeFile(path.join(outputRoot, 'surround.md'), surroundMarkdown(receipt));
        return receipt;
    } finally { result.release(); }
}

const f = (value, digits = 2) => (value === null || value === undefined ? 'n/a' : typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(digits) : String(value)) : String(value));
const mb = bytes => `${(bytes / 1048576).toFixed(2)} MB`;
const table = (header, rows) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');

/** @param {any} receipt */
export function surroundMarkdown(receipt) {
    const r = receipt, s = r.seam, lines = [`# Far-field surround (${r.recipe.id}): ${r.passed ? 'PASS' : `FAIL (${r.failed.join('; ')})`}`, '',
        `Recipe ${r.recipe.file} (sha256 ${r.recipe.sha256.slice(0, 12)}, identity ${r.recipe.identity}), ${r.recipe.grid.columns}² at ${r.recipe.grid.spacingX} m over ${r.recipe.grid.bounds.minX}..${r.recipe.grid.bounds.maxX} x ${r.recipe.grid.bounds.minZ}..${r.recipe.grid.bounds.maxZ}; continues ${r.source.landscapeId} ${r.source.revision} (manifest ${r.source.manifestSha256.slice(0, 12)}, boundary hash ${r.source.boundaryHash.slice(0, 12)}, ${r.source.nativeGrid.columns}² at ${r.source.nativeGrid.spacing} m) embedded ×${r.placement.factor} into columns ${r.placement.rectangle.column}..${r.placement.rectangle.column + r.placement.rectangle.columns - 1} / rows ${r.placement.rectangle.row}..${r.placement.rectangle.row + r.placement.rectangle.rows - 1} (${r.placement.filledSamples} samples filled: ${r.placement.fill.mode} toward ${r.placement.fill.heightMeters} m over ${r.placement.fill.fadeMeters} m, cover class ${r.placement.fill.coverClass}); operators masked outside the extent with a 0-${r.blendMeters} m blend.`, '',
        `Engine ${f(r.engine.totalSeconds, 1)} s, peak tracked ${mb(r.engine.peakTrackedBytes)} (${r.engine.peakPhase}, limit ${mb(r.engine.limitBytes)}); reference ${f(r.timing.referenceSeconds, 1)} s, measurement ${f(r.timing.measurementSeconds, 1)} s, render ${f(r.timing.renderSeconds, 1)} s, landscape ${f(r.timing.landscapeSeconds, 1)} s; total ${f(r.timing.totalSeconds, 1)} s.`, '',
        `Surround ${r.surround.id} ${r.surround.published ? 'published to' : 'written under'} ${r.surround.directory}: revision ${r.surround.revision} (content ${r.surround.contentRevision}, snapshot ${r.surround.manifestSnapshot}), ${r.surround.nodes} nodes (${r.surround.nativeChunks} native), ${r.surround.files} files, ${mb(r.surround.bytes.total)} by manifest (native ${mb(r.surround.bytes.nativeHeight + r.surround.bytes.nativeCover)}, ancestors ${mb(r.surround.bytes.ancestorHeight + r.surround.bytes.ancestorCover)}, manifest ${r.surround.bytes.manifest} B), ${mb(r.surround.bytes.onDisk)} on disk in ${r.surround.bytes.files} files; chunks ${f(r.surround.timing.chunkSeconds, 1)} s, hierarchy ${f(r.surround.timing.hierarchySeconds, 1)} s, verify ${f(r.surround.timing.verifySeconds, 1)} s.`, '',
        `Provenance preparation.surround: ${JSON.stringify(r.surround.block)}`, ''];
    lines.push('## Seam metrics', '', table(['measure', 'value'], [
        ['inside the extent: samples / height mismatches / max |surround - v3 decimated|', `${s.inside.samples} / ${s.inside.heightMismatches} / ${f(s.inside.maxAbsoluteDifferenceMeters, 6)} m${s.inside.worst ? ` (worst at column ${s.inside.worst.column}, row ${s.inside.worst.row})` : ''}`],
        ['inside the extent: cover samples changed by derive-land-cover', `${s.inside.coverChangedSamples} of ${s.inside.samples}`],
        ...s.edges.map(edge => [`${edge.edge} edge: step to the first outside sample max / p90 / p50 (inside neighbour step max / p90 / p50)`, `${f(edge.outsideStep.max)} / ${f(edge.outsideStep.p90)} / ${f(edge.outsideStep.p50)} m (${f(edge.insideStep.max)} / ${f(edge.insideStep.p90)} / ${f(edge.insideStep.p50)} m)`]),
        ['land / sea fraction: whole grid', `${(r.landSea.all.landFraction * 100).toFixed(2)}% / ${(r.landSea.all.seaFraction * 100).toFixed(2)}%`], ['land / sea fraction: inside the extent', `${(r.landSea.inside.landFraction * 100).toFixed(2)}% / ${(r.landSea.inside.seaFraction * 100).toFixed(2)}%`], ['land / sea fraction: outside the extent', `${(r.landSea.outside.landFraction * 100).toFixed(2)}% / ${(r.landSea.outside.seaFraction * 100).toFixed(2)}%`],
        ...r.continuity.map(end => [`far shoreline at z ${end.inside.z} (${end.end}): crossing inside / first outside row / polyline (design ${end.design.x})`, `x ${f(end.inside.crossingX, 1)} / ${f(end.outside.crossingX, 1)} / ${f(end.outside.polylineX, 1)} m: inside-outside ${f(end.insideToOutsideMeters, 1)} m, outside-polyline ${f(end.outsideToPolylineMeters, 1)} m, inside-design ${f(end.insideToDesignMeters, 1)} m`]),
        ['heights min / max', `${f(r.heights.min, 1)} / ${f(r.heights.max, 1)} m`], ['needles (one-sample spikes > 2 m)', `${r.needles.count}${r.needles.maxAt ? ` (tallest ${f(r.needles.maxProminenceMeters)} m at ${f(r.needles.maxAt.x, 0)}, ${f(r.needles.maxAt.z, 0)})` : ''}`],
        ['constrain-shoreline raised / lowered samples (inland hollows below 0.3 m)', r.engine.shoreline ? `${r.engine.shoreline.raisedSamples} / ${r.engine.shoreline.loweredSamples} (max ${f(r.engine.shoreline.maxChangeMeters)} m)` : 'n/a'],
        ['fluvial incision max / wear max', r.engine.fluvial ? `${f(r.engine.fluvial.maxIncisionMeters)} / ${f(r.engine.fluvial.maxWearMeters)} m` : 'n/a'],
        [`skyline from (${r.skyline.eye.x}, ${r.skyline.eye.z}) at ${r.skyline.eye.altitudeMeters} m: massifs above the far edge by >= ${r.skyline.eye.massifDegrees} deg`, `${r.skyline.massifs.length}: ${r.skyline.massifs.map(massif => `${massif.fromDegrees}..${massif.toDegrees} deg (${f(massif.peakHeightMeters, 0)} m at ${f(massif.peakDistanceMeters / 1000, 1)} km, +${f(massif.riseDegrees)} deg)`).join('; ') || 'none'}; gaps ${r.skyline.gapsDegrees.join(', ') || 'none'} deg; skyline max ${f(r.skyline.maxDegrees)} deg, far edge max ${f(r.skyline.maxFarEdgeDegrees)} deg`]]), '');
    lines.push('## Spur headlands (the far coast displaced seaward under the spur ridges, most prominent first)', '', table(['z', 'coast x', 'base coast x', 'seaward'], r.headlands.map(headland => [headland.z, f(headland.x, 0), f(headland.baseX, 0), `${f(headland.displacementMeters, 0)} m`])), '');
    lines.push('## Promontories', '', table(['operator', 'kind', 'changed samples', 'max change', 'waterline flips', 'max displacement'], Object.entries(r.engine.promontories).map(([id, entry]) => [id, entry.kind, entry.changedSamples, `${f(entry.maxChangeMeters, 1)} m`, entry.shoreline.flippedSamples, `${f(entry.shoreline.maxDisplacementMeters, 0)} m`])), '');
    lines.push('## Timings (s)', '', table(['operator', 'seconds'], r.engine.operators.map(entry => [`${entry.id} (${entry.op})`, f(entry.seconds, 2)])), '', table(['step', 'seconds'], Object.entries(r.timing).map(([key, value]) => [key, f(value, 1)])), '');
    if (r.landCover) {
        const ids = Object.keys(r.landCover.totals).map(Number).sort((a, b) => a - b);
        lines.push('## Land cover derivation (whole grid)', '', `Decided by rule: ${JSON.stringify(r.landCover.decidedByRule)}; ${r.landCover.changedSamples} of ${r.landCover.samples} samples changed class.`, '',
            table(['class', 'before', 'after', 'delta'], ids.map(id => [id, r.landCover.totals[id].before, r.landCover.totals[id].after, r.landCover.totals[id].delta])), '',
            `Inside the extent (reference = v3 decimated, nearest label): ${JSON.stringify(s.inside.coverMatrix)}`, '');
    }
    lines.push('## Images', '', ...Object.entries(r.images).map(([name, file]) => `- ${name}: ${file}`), '');
    return lines.join('\n');
}
