// Runs the D3 resolution study: the D2 fixture recipe synthesized at the three fixture spacings, each written as a standalone saved landscape and measured for size, cost, relief and feature sharpness on fixed world windows and points, with hillshade composites.
// @ts-check
// The study answers one question with measurements rather than projections: what a finer authoritative spacing costs (bytes by kind,
// nodes, depth, synthesis seconds per operator, hierarchy preparation seconds, peak tracked memory) and what it buys (shorter bluff
// faces with tighter crests, narrower berm crests, narrower gullies, tighter ridge crests) on terrain that is the same landform at every
// spacing: the analytic base and the world-anchored hills are identical on the shared vertices, the designed edges are world distances,
// and the erosion recipes are density scaled per square kilometer. Every window, transect and ridge point is fixed in world coordinates
// (the windows and ridge points are derived from the coarsest result and reused), so the three results are compared on identical ground,
// and the crops of one window render at one pixel size so a coarse grid shows its sample blocks. The optional city-extent pair (the
// analytic base over 4 x 4 km through a reduced recipe at 1.953125 and 0.9765625 m) gives the browser measurements fixtures at the
// coastal city's node counts (85 and 341 nodes); it records size and cost only, since the plan is 1 km.
import path from 'node:path';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../SynthesisGraph.mjs';
import { diagnoseRelief, needleStatistics, reliefDiagnosisMarkdown, sampleBilinear, slopeStatistics } from '../SynthesisAnalysis.mjs';
import { composeSheet, renderHillshade, renderHillshadeWindow, writeReviewPng } from '../SynthesisReview.mjs';
import { writeSynthesizedLandscape } from '../SynthesisLandscape.mjs';
import { authoringHash } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { createFixtureBase, fixtureSpacingTag, FIXTURE_CITY_EXTENT_METERS, FIXTURE_SEA_LEVEL } from '../fixture/FixtureBase.mjs';
import { fixtureConstraintOptions, fixtureGridOf, fixtureReadFile, fixtureSets, readFixturePlan } from '../fixture/SynthesisFixture.mjs';
import { bermCrestMeasure, bluffFaceMeasure, contributingAreaRaster, deepestIncisionPoint, distanceToPolygonBoundary, fixedWindow, gullyWidthMeasure, landformAgreement, nearestLocalMaximum, ridgeCurvatureMeasure, rowsWithTallestRise, selectRidgePoints, transectProfile, RIDGE_FIT_RADIUS_METERS } from './ResolutionMeasures.mjs';
import { shorelineXAt } from '../analysis/GridSampling.mjs';
import { validateLandscapeSynthesisRecipe } from '../../../../src/app/landscape/index.js';

export const RESOLUTION_STUDY_FORMAT = 'landscape-resolution-study';
export const RESOLUTION_STUDY_RECIPES = Object.freeze(['plateau-road-shoreline', 'plateau-road-shoreline-0977', 'plateau-road-shoreline-0488'].map(name => `tools/bake_landscape/terrain_synthesis/fixture/recipes/${name}.json`));
export const RESOLUTION_LANDSCAPE_ID_PREFIX = 'ai596-d3-fixture-';
/** Crop windows are 64 coarse intervals (125 m) so their edges are vertices of every fixture grid; crops render at 512 px (8 / 4 / 2 px per sample). */
export const RESOLUTION_WINDOW_INTERVALS = 64;
export const RESOLUTION_CROP_SIZE = 512;
export const RESOLUTION_FIXED_WINDOWS = Object.freeze([{ id: 'bluff', centerX: 300, centerZ: 300 }, { id: 'gully', centerX: null, centerZ: null }, { id: 'rim', centerX: 640, centerZ: 560 }].map(Object.freeze));
/** The fluvial operator's gully class (drainage 2): contributing area 10,000..50,000 m². */
export const RESOLUTION_GULLY_CLASS_M2 = Object.freeze({ min: 10000, max: 50000 });
export const RESOLUTION_RIDGE_POINTS = 6;
/** A fixed ridge point re-centers on each result's highest sample within this radius (erosion moves summits a little between spacings). */
export const RESOLUTION_RIDGE_RECENTER_METERS = 15;
/** Natural-land measurements keep this clearance from the plan districts (the plateau escarpment and the plaza feather are designed edges). */
export const RESOLUTION_DISTRICT_CLEARANCE_METERS = 60;
/** The coastal-bluff operator cuts within this distance of the shore (its maxDistanceFromShoreMeters): the reach the bluff transects are chosen in. */
const RESOLUTION_BLUFF_REACH_METERS = 160;
/** The reduced 4 x 4 km recipes (no plan: hills, strata, erosion, terraces, cap, geology) and the ids of their saved landscapes. */
export const RESOLUTION_CITY_RECIPES = Object.freeze(['city-extent-1953', 'city-extent-0977'].map(name => `tools/bake_landscape/terrain_synthesis/fixture/recipes/${name}.json`));
export const RESOLUTION_CITY_ID_PREFIX = 'ai596-d3-fixture-4km-';
const MEMORY_LIMIT_BYTES = 3 * 1024 * 1024 * 1024;
const CITY_MEMORY_LIMIT_BYTES = 6 * 1024 * 1024 * 1024;
const NATURAL_COVER = Object.freeze([2, 3]);
const seconds = started => (performance.now() - started) / 1000;

/**
 * Samples on natural land (grass or forest soil above the sea), outside every district by the clearance (the escarpment and the plaza
 * feather are designed edges, not natural relief) and away from roads and the shore. The polygon distance is evaluated last, only for
 * samples that pass the raster tests, so the predicate stays cheap over millions of samples.
 */
function naturalInclude(grid, heights, cover, layers, plan, { seaLevel, roadMeters, shoreMeters, districtClearanceMeters = RESOLUTION_DISTRICT_CLEARANCE_METERS }) {
    const { districtId, roadDistance, shoreSigned } = layers, polygons = plan.districts.map(district => district.boundary_xz_m);
    const clear = i => { const column = i % grid.columns, x = grid.minX + column * grid.spacingX, z = grid.maxZ - ((i - column) / grid.columns) * grid.spacingZ; return polygons.every(polygon => distanceToPolygonBoundary(polygon, x, z) >= districtClearanceMeters); };
    return i => heights[i] >= seaLevel && NATURAL_COVER.includes(cover[i]) && districtId[i] === 0 && roadDistance[i] >= roadMeters && shoreSigned[i] >= shoreMeters && clear(i);
}

/** The fixed measurement geometry, derived once from the coarsest result: the three crop windows, the ridge points and the bluff transects. */
function deriveFixedPoints(grid, heights, cover, layers, area, plan, tag, identity) {
    const include = naturalInclude(grid, heights, cover, layers, plan, { seaLevel: FIXTURE_SEA_LEVEL, roadMeters: 30, shoreMeters: 100 });
    const gully = deepestIncisionPoint(grid, heights, area, { include, areaMinM2: RESOLUTION_GULLY_CLASS_M2.min, areaMaxM2: RESOLUTION_GULLY_CLASS_M2.max, ridgeWindowMeters: 60, marginMeters: 80 });
    if (!gully) throw new Error('[ResolutionStudy] the coarsest result has no gully-class sample on natural land to center the gully window on');
    const windows = RESOLUTION_FIXED_WINDOWS.map(window => fixedWindow(grid, window.centerX ?? gully.x, window.centerZ ?? gully.z, RESOLUTION_WINDOW_INTERVALS, window.id));
    const marginSamples = Math.ceil((RIDGE_FIT_RADIUS_METERS + RESOLUTION_RIDGE_RECENTER_METERS + grid.spacingX) / grid.spacingX);
    const ridgeInclude = naturalInclude(grid, heights, cover, layers, plan, { seaLevel: FIXTURE_SEA_LEVEL, roadMeters: 40, shoreMeters: 200 });
    const inside = i => { const column = i % grid.columns, row = (i - column) / grid.columns; return column >= marginSamples && row >= marginSamples && column < grid.columns - marginSamples && row < grid.rows - marginSamples; };
    const ridgePoints = selectRidgePoints(grid, heights, { include: i => inside(i) && ridgeInclude(i), count: RESOLUTION_RIDGE_POINTS, separationMeters: 150, localWindowMeters: 30, reliefWindowMeters: 100 });
    if (ridgePoints.length < 3) throw new Error(`[ResolutionStudy] only ${ridgePoints.length} ridge points found on the coarsest result`);
    // bluff transects where the coarse result's coast has its tallest steps: the row with the tallest 5 m rise within the bluff reach of the shore in each third of the coast
    const shoreXOf = z => shorelineXAt(plan.shoreline.points_xyz_m, z);
    const bluffTransects = rowsWithTallestRise(grid, heights, z => ({ xStart: shoreXOf(z), xEnd: shoreXOf(z) + RESOLUTION_BLUFF_REACH_METERS }), { bands: 3 })
        .map(entry => ({ id: `B-${Math.round(entry.z)}`, z: entry.z, xStart: shoreXOf(entry.z) - 150, xEnd: shoreXOf(entry.z) + 300, shorelineX: shoreXOf(entry.z), coarseRise: { x: entry.x, riseMeters: entry.riseMeters, riseRunMeters: entry.riseRunMeters } }));
    return { derivedFrom: { tag, identity }, windowIntervals: RESOLUTION_WINDOW_INTERVALS, windowSizeMeters: RESOLUTION_WINDOW_INTERVALS * grid.spacingX, windows, gully, ridgePoints, ridgeFitRadiusMeters: RIDGE_FIT_RADIUS_METERS, ridgeRecenterMeters: RESOLUTION_RIDGE_RECENTER_METERS,
        bluffTransects, gullyClassM2: { ...RESOLUTION_GULLY_CLASS_M2 }, districtClearanceMeters: RESOLUTION_DISTRICT_CLEARANCE_METERS };
}

const transectMeasures = (grid, heights, transect) => {
    const profile = transectProfile(grid, heights, transect.z, transect.xStart, transect.xEnd);
    return { id: transect.id, z: transect.z, shorelineX: transect.shorelineX, bluff: bluffFaceMeasure(profile, { seaLevel: FIXTURE_SEA_LEVEL }), berm: bermCrestMeasure(profile, { seaLevel: FIXTURE_SEA_LEVEL }) };
};

/** The sharpness measurements of one result on the fixed geometry. */
function measureSharpness(grid, heights, cover, layers, area, plan, fixed) {
    const transects = fixtureSets(plan).transects.map(transect => transectMeasures(grid, heights, transect)), bluffTransects = fixed.bluffTransects.map(transect => transectMeasures(grid, heights, transect));
    const include = naturalInclude(grid, heights, cover, layers, plan, { seaLevel: FIXTURE_SEA_LEVEL, roadMeters: 30, shoreMeters: 100 });
    const gullies = Object.fromEntries([.5, 1].map(bank => [`bank${bank.toFixed(1).replace('.', '')}`, gullyWidthMeasure(grid, heights, area, { include, areaMinM2: fixed.gullyClassM2.min, areaMaxM2: fixed.gullyClassM2.max, bankMeters: bank })]));
    // at the fixed point, and re-centered on this result's own summit near it (erosion moves summits a little between spacings)
    const ridges = fixed.ridgePoints.map(point => {
        const summit = nearestLocalMaximum(grid, heights, point.x, point.z, fixed.ridgeRecenterMeters);
        return { id: point.id, fixed: ridgeCurvatureMeasure(grid, heights, point.x, point.z, fixed.ridgeFitRadiusMeters), heightDeltaFromCoarseMeters: sampleBilinear(grid, heights, point.x, point.z) - point.height,
            recentered: { ...summit, ...ridgeCurvatureMeasure(grid, heights, summit.x, summit.z, fixed.ridgeFitRadiusMeters) } };
    });
    // one-sample spikes are operator artifacts a heightfield cannot represent as relief; they are counted so the sharpness numbers can be read against them
    return { transects, bluffTransects, gullies, ridges, needles: needleStatistics(grid, heights, 2) };
}

/** Key relief numbers of a diagnosis document. @param {any} doc */
function reliefSummary(doc) {
    const natural = doc.slope.natural, window = meters => { const entry = doc.relief.windows.find(w => w.meters === meters); return entry ? { p50: entry.natural.p50, p90: entry.natural.p90, max: entry.natural.max } : null; };
    return { heights: doc.heights, slope: { bins: doc.slope.bins.map(bin => bin.label), fractions: natural.fractions, above10Fraction: natural.fractions.slice(3).reduce((a, b) => a + b, 0), above20Fraction: natural.atLeast20Degrees.fraction, above30Fraction: natural.atLeast30Degrees.fraction,
        mean: natural.mean, p50: natural.percentiles.p50, p90: natural.percentiles.p90, p99: natural.percentiles.p99, max: natural.percentiles.p100 },
        incision: { channelAreaM2: doc.incision.channelAreaM2, channelSamples: doc.incision.channelSamples, channelLengthMeters: doc.incision.channelLengthMeters, networks: doc.incision.networks, mean: doc.incision.incision.mean, p50: doc.incision.incision.p50, p90: doc.incision.incision.p90, max: doc.incision.incision.max },
        relief: { '100m': window(100), '500m': window(500) }, curvature: { profile: { p1: doc.curvature.profile.p1, p99: doc.curvature.profile.p99 }, plan: { p1: doc.curvature.plan.p1, p99: doc.curvature.plan.p99 } },
        constraints: { passed: doc.constraints.passed, failedChecks: doc.constraints.failedChecks, maxSustainedGradePercent: doc.constraints.roads.maxSustainedGradePercent, maxShortGradePercent: doc.constraints.roads.maxShortGradePercent, shorelineMaxDeviationMeters: doc.constraints.shoreline.maxDeviationMeters } };
}

/** The procedural-synthesis provenance of a saved landscape: the recipe, its identity and file hash, and the spacing the operators ran at. */
const synthesisProvenance = (recipe, recipeBytes, result) => ({ recipeId: recipe.id, identity: result.report.identity, recipeSha256: authoringHash(recipeBytes), sourceSpacingMeters: result.report.working.spacing });

/**
 * The published copy of a spacing's landscape under the cache root, read back as a cross-check (null when it is not published): its
 * revision, manifest hash, provenance kind and whether its heights are the ones this receipt measured.
 */
async function publishedLandscapeRecord(root, landscapeRoot, id, heightsSha256, signal) {
    const directory = path.resolve(root, landscapeRoot, id);
    try { await stat(path.join(directory, 'manifest.json')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    const saved = await readLandscapeFileManifest(directory, 'manifest.json', { signal }), provenance = saved.manifest.provenance;
    return { directory, revision: saved.manifest.revision, manifestSha256: authoringHash(saved.bytes), provenanceKind: provenance.kind, sameHeights: (provenance.preparation?.heightsSha256 ?? provenance.sourceSha256) === heightsSha256 };
}

/** Bytes of the saved landscape by kind, from the manifest (native and ancestor channels) and the directory (what is on disk after content addressing). */
async function landscapeBytes(written, directory) {
    const bytes = { nativeHeight: 0, nativeCover: 0, ancestorHeight: 0, ancestorCover: 0, manifest: 0, manifestSnapshot: 0, payloads: 0, total: 0, onDisk: 0, files: 0 };
    for (const chunk of written.manifest.chunks) {
        const native = chunk.level === written.manifest.grid.maxLevel;
        bytes[native ? 'nativeHeight' : 'ancestorHeight'] += chunk.channels.height.byteLength; bytes[native ? 'nativeCover' : 'ancestorCover'] += chunk.channels.landCover.byteLength;
    }
    bytes.manifest = (await stat(path.join(directory, 'manifest.json'))).size; bytes.manifestSnapshot = bytes.manifest;
    bytes.payloads = bytes.nativeHeight + bytes.nativeCover + bytes.ancestorHeight + bytes.ancestorCover; bytes.total = bytes.payloads + bytes.manifest + bytes.manifestSnapshot;
    const walk = async folder => { for (const entry of await readdir(folder, { withFileTypes: true })) { const file = path.join(folder, entry.name); if (entry.isDirectory()) await walk(file); else if (entry.isFile()) { bytes.onDisk += (await stat(file)).size; bytes.files++; } } };
    await walk(directory);
    return bytes;
}

/**
 * Synthesizes one recipe at its fixture spacing, measures it and writes it as a standalone saved landscape plus review images. `fixed` is
 * the measurement geometry and `reference` the coarse result ({grid, heights}) both derived from the first (coarsest) run; null for that run.
 * @param {{root:string,recipeFile:string,outputRoot:string,landscapeDirectory:string,fields:'bake'|'none',fixed:any|null,reference:{grid:any,heights:Float32Array}|null,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function synthesizeResolutionSpacing({ root, recipeFile, outputRoot, landscapeDirectory, fields, fixed, reference, signal, log = () => {} }) {
    const started = performance.now(), timing = {}, recipeBytes = await readFile(path.resolve(root, recipeFile)), recipe = validateLandscapeSynthesisRecipe(JSON.parse(recipeBytes.toString('utf8')));
    const fixtureGrid = fixtureGridOf(recipe), tag = fixtureSpacingTag(fixtureGrid.spacingX), spacing = fixtureGrid.spacingX, base = createFixtureBase(fixtureGrid), plan = await readFixturePlan(root, recipe);
    const outputDirectory = path.join(outputRoot, tag), exportRoot = path.join(outputDirectory, 'exports'), label = `${spacing} m (${fixtureGrid.columns} x ${fixtureGrid.rows})`;
    // outputs are regenerated every run: the saved landscape holds immutable content-addressed files of the previous recipe
    for (const directory of [outputDirectory, landscapeDirectory]) await rm(directory, { recursive: true, force: true });
    await mkdir(exportRoot, { recursive: true });
    log(`[ResolutionStudy] ${tag}: synthesizing ${recipe.id} on ${fixtureGrid.columns} x ${fixtureGrid.rows} at ${spacing} m`);
    const memory = new TerrainFieldMemory(MEMORY_LIMIT_BYTES);
    let mark = performance.now();
    const result = await executeSynthesisRecipe({ recipe, inputs: { root, readFile: fixtureReadFile(base), exportRoot }, memory, signal, log,
        onProgress: event => { if (event.phase === 'done') log(`[ResolutionStudy] ${tag}: ${event.index + 1}/${event.count} ${event.id} (${event.op}) ${event.seconds.toFixed(2)} s`); } });
    timing.synthesisSeconds = seconds(mark);
    try {
        const { grid, heights, cover, layers } = result, heightsSha256 = authoringHash(Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength));
        const hydraulic = result.report.operators.find(entry => entry.op === 'hydraulic-erosion'), hydraulicRecipe = recipe.operators.find(entry => entry.op === 'hydraulic-erosion');
        log(`[ResolutionStudy] ${tag}: engine ${result.report.totalSeconds.toFixed(1)} s, peak tracked ${(memory.peakBytes / 1048576).toFixed(0)} MB; diagnosing`);
        mark = performance.now();
        const doc = diagnoseRelief(grid, heights, cover, FIXTURE_SEA_LEVEL, plan, { label: recipe.id, log, constraints: fixtureConstraintOptions(base), sets: fixtureSets(plan), landscape: { recipe: recipeFile, identity: result.report.identity } });
        timing.diagnosisSeconds = seconds(mark);
        // sharpness on the fixed geometry (derived here when this is the coarsest result)
        mark = performance.now();
        const measurementMemory = new TerrainFieldMemory(MEMORY_LIMIT_BYTES), area = contributingAreaRaster(grid, heights, FIXTURE_SEA_LEVEL, measurementMemory);
        const geometry = fixed ?? deriveFixedPoints(grid, heights, cover, layers, area, plan, tag, result.report.identity);
        const sharpness = measureSharpness(grid, heights, cover, layers, area, plan, geometry);
        const agreement = reference ? landformAgreement(reference, { grid, heights }) : null;
        timing.sharpnessSeconds = seconds(mark);
        log(`[ResolutionStudy] ${tag}: sharpness measured in ${timing.sharpnessSeconds.toFixed(1)} s; writing the landscape to ${landscapeDirectory}`);
        // the standalone saved landscape (native chunks, measured hierarchy, manifest)
        mark = performance.now();
        const written = await writeSynthesizedLandscape({ sourceDirectory: null, outputDirectory: landscapeDirectory, grid, heights, cover, id: `${RESOLUTION_LANDSCAPE_ID_PREFIX}${tag}`, name: `AI 596 D3 resolution fixture ${spacing} m`, revisionLabel: recipe.id,
            provenance: { sourceName: `${recipe.id} on the analytic fixture base at ${spacing} m` }, synthesis: synthesisProvenance(recipe, recipeBytes, result), references: 'none', appearance: 'none', fields,
            chunkIntervals: fixtureGrid.chunkIntervals, maxLevel: fixtureGrid.maxLevel, seaLevel: FIXTURE_SEA_LEVEL, signal, log });
        timing.landscapeSeconds = seconds(mark);
        const bytes = await landscapeBytes(written, landscapeDirectory), build = written.hierarchy.builds[written.hierarchy.builds.length - 1];
        // review images: the full hillshade and the crops of the fixed windows (returned in memory for the composites)
        mark = performance.now();
        const images = {}, crops = {};
        const write = async (name, image) => { const file = path.join(outputDirectory, `${name}.png`); await writeReviewPng(file, image); images[name] = file; return image; };
        const hillshade = await write('hillshade', renderHillshade(grid, heights, { size: 1024, seaLevel: FIXTURE_SEA_LEVEL }));
        for (const window of geometry.windows) crops[window.id] = await write(`crop-${window.id}`, renderHillshadeWindow(grid, heights, { window, size: RESOLUTION_CROP_SIZE, seaLevel: FIXTURE_SEA_LEVEL }));
        timing.renderSeconds = seconds(mark);
        await writeFile(path.join(outputDirectory, 'diagnosis.json'), JSON.stringify(doc, null, 1));
        await writeFile(path.join(outputDirectory, 'diagnosis.md'), reliefDiagnosisMarkdown(doc));
        await writeFile(path.join(outputDirectory, 'engine-report.json'), JSON.stringify(result.report, null, 1));
        await writeFile(path.join(outputDirectory, 'landscape-receipt.json'), JSON.stringify({ directory: landscapeDirectory, revision: written.revision, manifestSha256: written.manifestSha256, contentRevision: written.contentRevision, timing: written.timing, hierarchy: written.hierarchy, files: written.files.length }, null, 1));
        timing.totalSeconds = seconds(started);
        const spacingResult = { tag, label, spacing, recipe: recipeFile, recipeId: recipe.id, recipeSha256: authoringHash(recipeBytes), identity: result.report.identity, heightsSha256,
            grid: { columns: grid.columns, rows: grid.rows, spacing, samples: heights.length, chunkIntervals: fixtureGrid.chunkIntervals, maxLevel: fixtureGrid.maxLevel },
            hierarchy: { depth: fixtureGrid.maxLevel + 1, maxLevel: fixtureGrid.maxLevel, nodes: written.manifest.chunks.length, nativeChunks: build.nativeChunks, sharedBorders: build.sharedBorders, levels: build.levels, sourceChunkReads: build.sourceChunkReads },
            bytes,
            synthesis: { operators: result.report.operators.map(({ id, op, seconds }) => ({ id, op, seconds })), totalSeconds: result.report.totalSeconds, peakTrackedBytes: memory.peakBytes, peakPhase: memory.peakPhase, limitBytes: MEMORY_LIMIT_BYTES,
                hydraulic: { droplets: hydraulic.statistics.droplets, declaredDroplets: hydraulicRecipe.params.droplets, dropletsPerSquareKilometer: hydraulicRecipe.params.dropletsPerSquareKilometer ?? null, radiusSamples: hydraulicRecipe.params.radius, radiusMeters: hydraulicRecipe.params.radius * spacing, steps: hydraulic.statistics.steps },
                fluvial: result.report.operators.find(entry => entry.op === 'fluvial-erosion')?.statistics.diffusionSubSteps ?? null },
            landscape: { directory: landscapeDirectory, id: written.manifest.id, revision: written.revision, contentRevision: written.contentRevision, manifestSha256: written.manifestSha256, timing: written.timing, fields: written.fields ? { revision: written.fields.revision, pages: written.fields.pages } : null },
            relief: reliefSummary(doc), agreementWithCoarse: agreement, sharpness, images, timing };
        // the coarse heights are kept (a copy, the engine releases its layers) as the agreement reference of the finer runs
        return { spacing: spacingResult, fixed: geometry, reference: reference ?? { grid: { ...grid }, heights: Float32Array.from(heights) }, crops, hillshade };
    } finally { result.release(); }
}

/**
 * Synthesizes one reduced city-extent recipe (the analytic base over 4 x 4 km, no plan) and writes it as a standalone saved landscape,
 * recording size and cost (bytes by kind, nodes, synthesis and hierarchy seconds, peak tracked memory) plus the slope statistics and a
 * hillshade; a run that fails (memory, time) is recorded with its elapsed cost instead of ending the study, so the receipt still says what
 * was attempted and why it stopped.
 * @param {{root:string,recipeFile:string,outputRoot:string,landscapeDirectory:string,fields:'bake'|'none',signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function synthesizeCityExtent({ root, recipeFile, outputRoot, landscapeDirectory, fields, signal, log = () => {} }) {
    const started = performance.now(), timing = {}, recipeBytes = await readFile(path.resolve(root, recipeFile)), recipe = validateLandscapeSynthesisRecipe(JSON.parse(recipeBytes.toString('utf8')));
    const fixtureGrid = fixtureGridOf(recipe), spacing = fixtureGrid.spacingX, tag = `4km-${fixtureSpacingTag(spacing)}`, label = `4 km, ${spacing} m (${fixtureGrid.columns} x ${fixtureGrid.rows})`;
    if (fixtureGrid.bounds.maxX !== FIXTURE_CITY_EXTENT_METERS || recipe.inputs.plan !== null) throw new Error(`[ResolutionStudy] ${recipeFile} is not a city-extent recipe (${FIXTURE_CITY_EXTENT_METERS} m bounds, no plan)`);
    const outputDirectory = path.join(outputRoot, tag), common = { tag, label, spacing, recipe: recipeFile, recipeId: recipe.id, recipeSha256: authoringHash(recipeBytes), grid: { columns: fixtureGrid.columns, rows: fixtureGrid.rows, spacing, samples: fixtureGrid.columns * fixtureGrid.rows, chunkIntervals: fixtureGrid.chunkIntervals, maxLevel: fixtureGrid.maxLevel } };
    for (const directory of [outputDirectory, landscapeDirectory]) await rm(directory, { recursive: true, force: true });
    await mkdir(outputDirectory, { recursive: true });
    const memory = new TerrainFieldMemory(CITY_MEMORY_LIMIT_BYTES);
    let result = null;
    try {
        log(`[ResolutionStudy] ${tag}: synthesizing ${recipe.id} on ${fixtureGrid.columns} x ${fixtureGrid.rows} at ${spacing} m (${(fixtureGrid.columns * fixtureGrid.rows / 1e6).toFixed(1)} M samples)`);
        let mark = performance.now();
        result = await executeSynthesisRecipe({ recipe, inputs: { root, readFile: fixtureReadFile(createFixtureBase(fixtureGrid)) }, memory, signal, log,
            onProgress: event => { if (event.phase === 'done') log(`[ResolutionStudy] ${tag}: ${event.index + 1}/${event.count} ${event.id} (${event.op}) ${event.seconds.toFixed(2)} s`); } });
        timing.synthesisSeconds = seconds(mark);
        const { grid, heights, cover } = result, heightsSha256 = authoringHash(Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength));
        log(`[ResolutionStudy] ${tag}: engine ${result.report.totalSeconds.toFixed(1)} s, peak tracked ${(memory.peakBytes / 1048576).toFixed(0)} MB; writing the landscape to ${landscapeDirectory}`);
        mark = performance.now();
        const written = await writeSynthesizedLandscape({ sourceDirectory: null, outputDirectory: landscapeDirectory, grid, heights, cover, id: `${RESOLUTION_CITY_ID_PREFIX}${fixtureSpacingTag(spacing)}`, name: `AI 596 D3 city-extent fixture ${spacing} m`, revisionLabel: recipe.id,
            provenance: { sourceName: `${recipe.id} on the analytic fixture base over ${FIXTURE_CITY_EXTENT_METERS} m at ${spacing} m` }, synthesis: synthesisProvenance(recipe, recipeBytes, result), references: 'none', appearance: 'none', fields,
            chunkIntervals: fixtureGrid.chunkIntervals, maxLevel: fixtureGrid.maxLevel, seaLevel: FIXTURE_SEA_LEVEL, signal, log });
        timing.landscapeSeconds = seconds(mark);
        const bytes = await landscapeBytes(written, landscapeDirectory), build = written.hierarchy.builds[written.hierarchy.builds.length - 1];
        mark = performance.now();
        const slope = slopeStatistics(grid, heights, cover, { seaLevel: FIXTURE_SEA_LEVEL });
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < heights.length; i++) { if (heights[i] < min) min = heights[i]; if (heights[i] > max) max = heights[i]; }
        timing.statisticsSeconds = seconds(mark);
        mark = performance.now();
        const images = { hillshade: path.join(outputDirectory, 'hillshade.png') };
        await writeReviewPng(images.hillshade, renderHillshade(grid, heights, { size: 1024, seaLevel: FIXTURE_SEA_LEVEL }));
        timing.renderSeconds = seconds(mark);
        await writeFile(path.join(outputDirectory, 'engine-report.json'), JSON.stringify(result.report, null, 1));
        await writeFile(path.join(outputDirectory, 'landscape-receipt.json'), JSON.stringify({ directory: landscapeDirectory, revision: written.revision, manifestSha256: written.manifestSha256, contentRevision: written.contentRevision, timing: written.timing, hierarchy: written.hierarchy, files: written.files.length }, null, 1));
        timing.totalSeconds = seconds(started);
        return { ...common, failed: false, identity: result.report.identity, heightsSha256,
            hierarchy: { depth: fixtureGrid.maxLevel + 1, maxLevel: fixtureGrid.maxLevel, nodes: written.manifest.chunks.length, nativeChunks: build.nativeChunks, sharedBorders: build.sharedBorders, levels: build.levels, sourceChunkReads: build.sourceChunkReads },
            bytes, synthesis: { operators: result.report.operators.map(({ id, op, seconds }) => ({ id, op, seconds })), totalSeconds: result.report.totalSeconds, peakTrackedBytes: memory.peakBytes, peakPhase: memory.peakPhase, limitBytes: CITY_MEMORY_LIMIT_BYTES },
            landscape: { directory: landscapeDirectory, id: written.manifest.id, revision: written.revision, contentRevision: written.contentRevision, manifestSha256: written.manifestSha256, timing: written.timing, fields: written.fields ? { revision: written.fields.revision, pages: written.fields.pages } : null },
            heights: { min, max }, slope: { above10Fraction: slope.natural.fractions.slice(3).reduce((a, b) => a + b, 0), above20Fraction: slope.natural.atLeast20Degrees.fraction, p90: slope.natural.percentiles.p90, p99: slope.natural.percentiles.p99, max: slope.natural.percentiles.p100, naturalSamples: slope.natural.count },
            images, timing };
    } catch (error) {
        if (signal?.aborted) throw error;
        log(`[ResolutionStudy] ${tag}: FAILED after ${seconds(started).toFixed(1)} s (peak tracked ${(memory.peakBytes / 1048576).toFixed(0)} MB): ${error.message}`);
        return { ...common, failed: true, error: error.message, elapsedSeconds: seconds(started), synthesis: { totalSeconds: timing.synthesisSeconds ?? null, peakTrackedBytes: memory.peakBytes, peakPhase: memory.peakPhase, limitBytes: CITY_MEMORY_LIMIT_BYTES }, timing };
    } finally { result?.release(); }
}

/** The three spacings in recipe order (coarsest first, since it defines the fixed geometry) and their composites. */
async function synthesizeSpacings({ root, recipeFiles, outputRoot, landscapeRoot, fields, signal, log }) {
    const spacings = [], crops = [], hillshades = [];
    let fixed = null, reference = null;
    for (const recipeFile of recipeFiles) {
        signal?.throwIfAborted();
        const recipe = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve(root, recipeFile), 'utf8'))), tag = fixtureSpacingTag(recipe.grid.spacingX);
        if (spacings.length && recipe.grid.spacingX >= spacings[spacings.length - 1].spacing) throw new Error('[ResolutionStudy] recipes must run from the coarsest to the finest spacing (the coarsest result fixes the measurement geometry)');
        const landscapeDirectory = landscapeRoot ? path.resolve(root, landscapeRoot, `${RESOLUTION_LANDSCAPE_ID_PREFIX}${tag}`) : path.join(outputRoot, 'landscapes', tag);
        const run = await synthesizeResolutionSpacing({ root, recipeFile, outputRoot, landscapeDirectory, fields, fixed, reference, signal, log });
        fixed = run.fixed; reference = run.reference; spacings.push(run.spacing); crops.push(run.crops); hillshades.push(run.hillshade);
        log(`[ResolutionStudy] ${tag}: done in ${run.spacing.timing.totalSeconds.toFixed(1)} s (${run.spacing.hierarchy.nodes} nodes, ${(run.spacing.bytes.total / 1048576).toFixed(1)} MB, revision ${run.spacing.landscape.revision})`);
    }
    // composites: [coarsest | ... | finest] per window and of the full hillshades
    const composites = {};
    const compose = async (name, images) => { const file = path.join(outputRoot, `composite-${name}.png`); await writeReviewPng(file, composeSheet(images.map((image, i) => ({ image, label: spacings[i].label })))); composites[name] = file; };
    for (const window of fixed.windows) await compose(window.id, crops.map(entry => entry[window.id]));
    await compose('hillshade', hillshades);
    return { recipes: recipeFiles, landscapeRoot, fields, fixed, spacings, composites };
}

/**
 * The whole study: the three spacings, the composites, the optional city-extent pair and the receipt. `cityExtent` false runs the spacings
 * alone, true adds the city pair, and 'only' runs the city pair alone and merges it into the receipt of the last full run in the output root
 * (the spacings, geometry and composites are kept, and the published copies of the spacings under the cache root are read back as a
 * cross-check), which re-publishes the 4 km fixtures without touching the 1 km ones.
 * @param {{root:string,recipeFiles:string[],outputRoot:string,landscapeRoot?:string|null,fields?:'bake'|'none',cityExtent?:boolean|'only',cityRecipeFiles?:string[],signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function runResolutionStudy({ root, recipeFiles, outputRoot, landscapeRoot = null, fields = 'none', cityExtent = false, cityRecipeFiles = [...RESOLUTION_CITY_RECIPES], signal, log = () => {} }) {
    const started = performance.now(), receiptFile = path.join(outputRoot, 'resolution-study.json');
    await mkdir(outputRoot, { recursive: true });
    let base;
    if (cityExtent === 'only') {
        let previous;
        try { previous = JSON.parse(await readFile(receiptFile, 'utf8')); } catch (error) { throw new Error(`[ResolutionStudy] city-extent=only needs the receipt of a full run at ${receiptFile}: ${error.message}`); }
        if (previous.format !== RESOLUTION_STUDY_FORMAT || previous.schemaVersion !== 1 || !Array.isArray(previous.spacings) || !previous.spacings.length || !previous.fixed) throw new Error(`[ResolutionStudy] ${receiptFile} is not a resolution-study receipt with measured spacings`);
        base = { recipes: previous.recipes, landscapeRoot: previous.landscapeRoot, fields: previous.fields, fixed: previous.fixed, spacings: previous.spacings, composites: previous.composites };
        for (const spacing of base.spacings) spacing.published = landscapeRoot ? await publishedLandscapeRecord(root, landscapeRoot, `${RESOLUTION_LANDSCAPE_ID_PREFIX}${spacing.tag}`, spacing.heightsSha256, signal) : null;
        log(`[ResolutionStudy] city extent only: keeping the ${base.spacings.length} spacings of ${receiptFile}`);
    } else base = await synthesizeSpacings({ root, recipeFiles, outputRoot, landscapeRoot, fields, signal, log });
    let city = null;
    if (cityExtent) {
        city = { extentMeters: FIXTURE_CITY_EXTENT_METERS, recipes: cityRecipeFiles, landscapeRoot, runMode: cityExtent === 'only' ? 'only' : 'with-spacings', spacings: [] };
        for (const recipeFile of cityRecipeFiles) {
            signal?.throwIfAborted();
            const recipe = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve(root, recipeFile), 'utf8'))), tag = fixtureSpacingTag(recipe.grid.spacingX);
            const landscapeDirectory = landscapeRoot ? path.resolve(root, landscapeRoot, `${RESOLUTION_CITY_ID_PREFIX}${tag}`) : path.join(outputRoot, 'landscapes', `4km-${tag}`);
            const entry = await synthesizeCityExtent({ root, recipeFile, outputRoot, landscapeDirectory, fields, signal, log });
            city.spacings.push(entry);
            if (!entry.failed) log(`[ResolutionStudy] ${entry.tag}: done in ${entry.timing.totalSeconds.toFixed(1)} s (${entry.hierarchy.nodes} nodes, ${(entry.bytes.total / 1048576).toFixed(1)} MB, revision ${entry.landscape.revision})`);
        }
    }
    const study = { format: RESOLUTION_STUDY_FORMAT, schemaVersion: 1, ...base, cityExtent: city, totalSeconds: seconds(started) };
    await writeFile(receiptFile, JSON.stringify(study, null, 1));
    await writeFile(path.join(outputRoot, 'resolution-study.md'), resolutionStudyMarkdown(study));
    return study;
}

const f = (value, digits = 2) => (value === null || value === undefined ? 'n/a' : typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(digits) : String(value)) : String(value));
const mb = bytes => `${(bytes / 1048576).toFixed(2)} MB`;
const pct = value => (value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(2)}%`);
const table = (header, rows) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');

/** @param {any} study */
export function resolutionStudyMarkdown(study) {
    const S = study.spacings, head = ['measure', ...S.map(s => s.label)], lines = [`# D3 resolution study: ${S.map(s => `${s.spacing} m`).join(' | ')}`, '',
        `Recipes ${study.recipes.join(', ')}; fixed geometry derived from ${study.fixed.derivedFrom.tag} (${study.fixed.derivedFrom.identity}); total ${study.totalSeconds.toFixed(1)} s.`, ''];
    lines.push('## Size and cost', '', table(head, [
        ['grid', ...S.map(s => `${s.grid.columns} x ${s.grid.rows} (${s.grid.samples} samples)`)], ['hierarchy depth / nodes', ...S.map(s => `maxLevel ${s.hierarchy.maxLevel}, ${s.hierarchy.depth} levels, ${s.hierarchy.nodes} nodes (${s.hierarchy.nativeChunks} native)`)],
        ['native height / cover bytes', ...S.map(s => `${mb(s.bytes.nativeHeight)} / ${mb(s.bytes.nativeCover)}`)], ['ancestor height / cover bytes', ...S.map(s => `${mb(s.bytes.ancestorHeight)} / ${mb(s.bytes.ancestorCover)}`)],
        ['manifest bytes (+ snapshot)', ...S.map(s => `${s.bytes.manifest} (+ ${s.bytes.manifestSnapshot})`)], ['total by manifest / on disk', ...S.map(s => `${mb(s.bytes.total)} / ${mb(s.bytes.onDisk)} (${s.bytes.files} files)`)],
        ['synthesis seconds', ...S.map(s => f(s.synthesis.totalSeconds, 1))], ['peak tracked memory', ...S.map(s => `${mb(s.synthesis.peakTrackedBytes)} (${s.synthesis.peakPhase})`)],
        ['landscape write seconds (chunks / hierarchy / verify / total)', ...S.map(s => `${f(s.landscape.timing.chunkSeconds, 1)} / ${f(s.landscape.timing.hierarchySeconds, 1)} / ${f(s.landscape.timing.verifySeconds, 1)} / ${f(s.landscape.timing.totalSeconds, 1)}`)],
        ['ancestor max geometric error by level', ...S.map(s => s.hierarchy.levels.filter(level => level.level < s.hierarchy.maxLevel).map(level => `L${level.level} ${f(level.maxGeometricError)} m`).join(', '))],
        ['hydraulic droplets / brush', ...S.map(s => `${s.synthesis.hydraulic.droplets} / ${s.synthesis.hydraulic.radiusSamples} samples = ${f(s.synthesis.hydraulic.radiusMeters, 2)} m`)],
        ['diagnosis / sharpness / render seconds', ...S.map(s => `${f(s.timing.diagnosisSeconds, 1)} / ${f(s.timing.sharpnessSeconds, 1)} / ${f(s.timing.renderSeconds, 1)}`)], ['landscape', ...S.map(s => `${s.landscape.directory} (${s.landscape.revision})`)],
        ...(S.some(s => s.published !== undefined) ? [['published copy under the cache root', ...S.map(s => (s.published ? `${s.published.directory} (${s.published.revision}, ${s.published.provenanceKind}${s.published.sameHeights ? ', same heights' : ', DIFFERENT HEIGHTS'})` : 'not published'))]] : [])]), '');
    lines.push('## Synthesis seconds per operator', '', table(['operator', ...S.map(s => `${s.spacing} m`)], S[0].synthesis.operators.map((entry, i) => [`${entry.id} (${entry.op})`, ...S.map(s => f(s.synthesis.operators[i]?.seconds, 2))])), '');
    lines.push('## Relief (natural land, the fixture measurement sets)', '', table(head, [
        ['slope above 10 / 20 / 30 degrees', ...S.map(s => `${pct(s.relief.slope.above10Fraction)} / ${pct(s.relief.slope.above20Fraction)} / ${pct(s.relief.slope.above30Fraction)}`)],
        ['slope p50 / p90 / p99 / max (deg)', ...S.map(s => `${f(s.relief.slope.p50)} / ${f(s.relief.slope.p90)} / ${f(s.relief.slope.p99)} / ${f(s.relief.slope.max, 1)}`)],
        ['incision p50 / p90 / max (m)', ...S.map(s => `${f(s.relief.incision.p50)} / ${f(s.relief.incision.p90)} / ${f(s.relief.incision.max)}`)], ['channel samples / length / networks', ...S.map(s => `${s.relief.incision.channelSamples} / ${f(s.relief.incision.channelLengthMeters, 0)} m / ${s.relief.incision.networks}`)],
        ['relief p90 over 100 m / 500 m', ...S.map(s => `${f(s.relief.relief['100m']?.p90)} / ${f(s.relief.relief['500m']?.p90)} m`)], ['profile curvature p1 / p99 (1/m)', ...S.map(s => `${f(s.relief.curvature.profile.p1, 4)} / ${f(s.relief.curvature.profile.p99, 4)}`)],
        ['constraint report (the D2 gate is the authority: it excepts the headland vertices, which leave the design shoreline by design)', ...S.map(s => `${s.relief.constraints.failedChecks.length ? `flagged: ${s.relief.constraints.failedChecks.join(', ')}` : 'pass'}; roads ${f(s.relief.constraints.maxSustainedGradePercent)}% sustained; shoreline max ${f(s.relief.constraints.shorelineMaxDeviationMeters, 1)} m`)]]), '',
        'Incision and local relief include the needles (next section), which stand several meters above their channel floors.', '');
    lines.push('## Same landform? Height agreement with the coarsest result on the shared vertices', '', table(head, [
        ['|dh| p50 / p90 / p99 / max', ...S.map(s => (s.agreementWithCoarse ? `${f(s.agreementWithCoarse.absoluteDeltaMeters.p50, 3)} / ${f(s.agreementWithCoarse.absoluteDeltaMeters.p90, 3)} / ${f(s.agreementWithCoarse.absoluteDeltaMeters.p99)} / ${f(s.agreementWithCoarse.absoluteDeltaMeters.max, 1)} m` : 'reference'))],
        ['within 0.5 / 1 / 3 m', ...S.map(s => (s.agreementWithCoarse ? `${pct(s.agreementWithCoarse.within['0.5m'])} / ${pct(s.agreementWithCoarse.within['1m'])} / ${pct(s.agreementWithCoarse.within['3m'])}` : 'reference'))],
        ['largest difference at', ...S.map(s => (s.agreementWithCoarse ? `(${f(s.agreementWithCoarse.maxAt.x, 1)}, ${f(s.agreementWithCoarse.maxAt.z, 1)}): ${f(s.agreementWithCoarse.maxAt.coarseHeight, 1)} -> ${f(s.agreementWithCoarse.maxAt.fineHeight, 1)} m` : 'reference'))]]), '',
        'Differences of a few meters mark channels the erosion relocated between grids (density-scaled droplets are seeded in sample coordinates); the shared landform is everything else.', '');
    const transectRow = (set, label, id, pick) => [label, ...S.map(s => pick(s.sharpness[set].find(entry => entry.id === id)))];
    const bluffRows = set => S[0].sharpness[set].flatMap(t => [
        transectRow(set, `${t.id} (Z ${f(t.z, 0)}) run / rise / mean slope`, t.id, entry => (entry.bluff.face ? `${f(entry.bluff.face.runMeters)} m / ${f(entry.bluff.face.riseMeters)} m / ${f(entry.bluff.face.meanSlopeDegrees, 1)} deg` : 'no face >= 40 deg')),
        transectRow(set, `${t.id} crest radius / toe radius`, t.id, entry => (entry.bluff.face ? `${f(entry.bluff.face.crestRadiusMeters)} m / ${f(entry.bluff.face.toeRadiusMeters)} m` : 'n/a')),
        transectRow(set, `${t.id} steepest 1 m slope / rise over 5 m`, t.id, entry => (entry.bluff.steepest ? `${f(entry.bluff.steepest.slopeDegrees, 1)} deg at x ${f(entry.bluff.steepest.x, 1)} / ${f(entry.bluff.steepest.rise5mMeters)} m` : 'no crossing'))]);
    lines.push('## Sharpness: bluff face on the fixture transects T-300/T-500/T-700 (face = rising slope >= 40 deg over a 1 m baseline)', '', table(head, bluffRows('transects')), '');
    lines.push(`## Sharpness: bluff face on the transects through the coarse result's tallest coastal steps (${study.fixed.bluffTransects.map(t => `${t.id}: ${f(t.coarseRise.riseMeters, 1)} m over ${t.coarseRise.riseRunMeters} m at x ${f(t.coarseRise.x, 0)}`).join('; ')})`, '', table(head, bluffRows('bluffTransects')), '');
    lines.push('## Sharpness: berm crest on the fixture transects (width within 0.1 m of the crest; crest radius from a 2 m chord)', '', table(head, S[0].sharpness.transects.map(t => transectRow('transects', t.id, t.id, entry => (entry.berm.berm ? `${f(entry.berm.berm.height)} m at +${f(entry.berm.berm.distanceFromCrossing, 1)} m, crest width ${f(entry.berm.berm.crestWidthMeters)} m, crest radius ${f(entry.berm.berm.crestRadiusMeters, 1)} m` : 'no berm')))), '');
    lines.push(`## Sharpness: gully width (contributing area ${study.fixed.gullyClassM2.min}..${study.fixed.gullyClassM2.max} m², cross-section perpendicular to the flow)`, '', table(head, [.5, 1].flatMap(bank => {
        const key = `bank${bank.toFixed(1).replace('.', '')}`;
        return [[`${bank} m above the floor: mean / median / p90 width`, ...S.map(s => { const g = s.sharpness.gullies[key]; return g.widthMeters ? `${f(g.widthMeters.mean)} / ${f(g.widthMeters.median)} / ${f(g.widthMeters.p90)} m` : 'none measured'; })],
            [`${bank} m above the floor: measured / unbounded / flat of visited`, ...S.map(s => { const g = s.sharpness.gullies[key]; return `${g.measured} / ${g.unbounded} / ${g.flat} of ${g.visited} (${g.candidates} in class, ${g.needles} needle floors skipped)`; })]];
    })), '');
    lines.push(`## Sharpness: ridge crests (quadratic fit within ${study.fixed.ridgeFitRadiusMeters} m; fixed point, then re-centered on the result's summit within ${study.fixed.ridgeRecenterMeters} m)`, '',
        table(['point (x, z)', ...S.map(s => `${s.spacing} m: fixed radius / dh vs coarse; re-centered radius at summit (moved)`)], study.fixed.ridgePoints.map((point, i) => [`${point.id} (${f(point.x, 1)}, ${f(point.z, 1)}) relief ${f(point.reliefMeters, 1)} m`,
            ...S.map(s => { const r = s.sharpness.ridges[i]; return `${f(r.fixed.crestRadiusMeters, 1)} m / ${f(r.heightDeltaFromCoarseMeters)} m; ${f(r.recentered.crestRadiusMeters, 1)} m at ${f(r.recentered.height, 1)} m (${f(r.recentered.distanceMeters, 1)} m)`; })])), '',
        'A fixed point whose height moved by meters sits on a relocated channel wall in that result; the re-centered value is the crest that exists there.', '');
    lines.push('## Needles (one-sample spikes more than 2 m above all 8 neighbours: operator artifacts, not relief)', '', table(head, [
        ['count / per km²', ...S.map(s => `${s.sharpness.needles.count} / ${f(s.sharpness.needles.perSquareKilometer, 0)}`)], ['mean / max prominence', ...S.map(s => `${f(s.sharpness.needles.meanProminenceMeters)} / ${f(s.sharpness.needles.maxProminenceMeters)} m`)],
        ['tallest at', ...S.map(s => (s.sharpness.needles.maxAt ? `(${f(s.sharpness.needles.maxAt.x, 1)}, ${f(s.sharpness.needles.maxAt.z, 1)}) h ${f(s.sharpness.needles.maxAt.height, 1)} m` : 'none'))]]), '');
    lines.push('## Fixed windows and composites', '', table(['window', 'bounds (m)', 'composite'], study.fixed.windows.map(w => [w.id, `${f(w.minX, 1)}..${f(w.maxX, 1)} x ${f(w.minZ, 1)}..${f(w.maxZ, 1)} (${f(w.sizeMeters, 0)} m)`, study.composites[w.id]])), '', `Full hillshade composite: ${study.composites.hillshade}`, '');
    if (study.cityExtent) {
        const C = study.cityExtent.spacings, done = C.filter(c => !c.failed);
        lines.push(`## City extent (${study.cityExtent.extentMeters} m, reduced recipe: no plan, fluvial 40 iterations, cap 160 m; run ${study.cityExtent.runMode}${study.cityExtent.landscapeRoot ? `, published under ${study.cityExtent.landscapeRoot}` : ''})`, '');
        for (const c of C.filter(c => c.failed)) lines.push(`- ${c.label}: FAILED after ${f(c.elapsedSeconds, 1)} s (peak tracked ${mb(c.synthesis.peakTrackedBytes)}): ${c.error}`, '');
        if (done.length) lines.push(table(['measure', ...done.map(c => c.label)], [
            ['grid', ...done.map(c => `${c.grid.columns} x ${c.grid.rows} (${c.grid.samples} samples)`)], ['hierarchy depth / nodes', ...done.map(c => `maxLevel ${c.hierarchy.maxLevel}, ${c.hierarchy.depth} levels, ${c.hierarchy.nodes} nodes (${c.hierarchy.nativeChunks} native)`)],
            ['native height / cover bytes', ...done.map(c => `${mb(c.bytes.nativeHeight)} / ${mb(c.bytes.nativeCover)}`)], ['ancestor height / cover bytes', ...done.map(c => `${mb(c.bytes.ancestorHeight)} / ${mb(c.bytes.ancestorCover)}`)],
            ['manifest bytes (+ snapshot)', ...done.map(c => `${c.bytes.manifest} (+ ${c.bytes.manifestSnapshot})`)], ['total by manifest / on disk', ...done.map(c => `${mb(c.bytes.total)} / ${mb(c.bytes.onDisk)} (${c.bytes.files} files)`)],
            ['synthesis seconds', ...done.map(c => f(c.synthesis.totalSeconds, 1))], ['peak tracked memory', ...done.map(c => `${mb(c.synthesis.peakTrackedBytes)} (${c.synthesis.peakPhase})`)],
            ['landscape write seconds (chunks / hierarchy / verify / total)', ...done.map(c => `${f(c.landscape.timing.chunkSeconds, 1)} / ${f(c.landscape.timing.hierarchySeconds, 1)} / ${f(c.landscape.timing.verifySeconds, 1)} / ${f(c.landscape.timing.totalSeconds, 1)}`)],
            ['ancestor max geometric error by level', ...done.map(c => c.hierarchy.levels.filter(level => level.level < c.hierarchy.maxLevel).map(level => `L${level.level} ${f(level.maxGeometricError)} m`).join(', '))],
            ['heights min / max', ...done.map(c => `${f(c.heights.min, 1)} / ${f(c.heights.max, 1)} m`)], ['natural slope > 10 / > 20 deg, p90 / p99 / max', ...done.map(c => `${pct(c.slope.above10Fraction)} / ${pct(c.slope.above20Fraction)}, ${f(c.slope.p90)} / ${f(c.slope.p99)} / ${f(c.slope.max, 1)} deg`)],
            ['landscape', ...done.map(c => `${c.landscape.directory} (${c.landscape.revision})`)]]), '');
        lines.push(table(['operator', ...done.map(c => c.label)], (done[0]?.synthesis.operators ?? []).map((entry, i) => [`${entry.id} (${entry.op})`, ...done.map(c => f(c.synthesis.operators[i]?.seconds, 2))])), '');
    }
    return lines.join('\n');
}
