// Runs the AI 596 D4 coastal terrain v3 synthesis: the coastal-v3 recipe on the 4097² grid (or the 1.953125 m working grid for iteration), the declared-targets and hard-constraint report, review maps and profiles, the saved landscape with references, fields and geology, an optional edit replay, and the receipt.
// @ts-check
// The leaf runs the recipe once (determinism is the fixture gate's job; the identity is recorded), measures the result on the grid the
// operators ran on (the working grid when iterating, so faces and berms are judged where the layers exist), evaluates every column-B
// target and every hard plan constraint, renders the review images and writes the landscape as id coastal-city-v3 through
// writeSynthesizedLandscape (references copied from v2, appearance none because the grid changed, fields re-baked under the v3 fields
// recipe with its documented working limit, the procedural-synthesis provenance), then prepares, validates and publishes the geology
// sidecar manifest-last under the authoring lock. The receipt carries the pass/fail table, the operator timings, the memory and bytes
// on disk, the land cover transition matrix, the published revision and the immutable manifest snapshot name; the job fails on any
// failing row after the receipt and images are written, so the evidence of a failing candidate is kept.
import path from 'node:path';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { readTerrainFieldSource } from '../../terrain_fields/TerrainFieldsSource.mjs';
import { executeSynthesisRecipe } from '../SynthesisGraph.mjs';
import { upsampleCover, upsampleFactor } from '../SynthesisWorkingGrid.mjs';
import { diagnoseRelief, reliefDiagnosisMarkdown, needleStatistics, localRelief, sampleBilinear, shoreTransect, measureCoastalV3, evaluateCoastalV3, coastalV3TargetsMarkdown, recipeDistrictProfiles, COASTAL_V3_TARGETS } from '../SynthesisAnalysis.mjs';
import { renderHillshade, renderMultidirectionalHillshade, renderSlopeMap, renderElevationMap, renderReliefMap, renderCoverMap, renderProfilePlot, renderHistogramPlot, composeSheet, writeReviewPng } from '../SynthesisReview.mjs';
import { writeSynthesizedLandscape } from '../SynthesisLandscape.mjs';
import { prepareLandscapeGeology, publishLandscapeGeology, validateLandscapeGeologyCandidate } from '../geology/GeologyPreparation.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { acquireAuthoringLock, authoringHash } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { loadReviewPoses } from '../../../landscape_review/ReviewPoses.mjs';
import { validateLandscapeSynthesisRecipe, LANDSCAPE_GEOLOGY_LAYERS } from '../../../../src/app/landscape/index.js';
import { LANDSCAPE_DEFAULT_DIRECTORY } from '../../../../src/app/landscape/LandscapeCache.js';

export const COASTAL_V3_FORMAT = 'landscape-coastal-v3';
export const COASTAL_V3_RECIPE = 'tools/bake_landscape/terrain_synthesis/recipes/coastal-v3.json';
export const COASTAL_V3_FIELDS_RECIPE = 'tools/bake_landscape/terrain_synthesis/recipes/terrain-fields-coastal-v3.json';
export const COASTAL_V3_POSES = 'tools/landscape_review/poses/natural-world-v1.json';
export const COASTAL_V3_LANDSCAPE_ID = 'coastal-city-v3';
export const COASTAL_V3_OUTPUT = 'tests/artifacts/screens/landscape/ai596/d4/v3';
export const COASTAL_V3_WORKING_MODES = Object.freeze({ native: null, 1953: 1.953125 });
/** 3 GiB for the synthesis ledger (D3 measured 1393 MB for the reduced 4 km recipe; the full recipe adds the plan and coastal layers). */
export const COASTAL_V3_MEMORY_LIMIT_BYTES = 3 * 1024 * 1024 * 1024;
/** The geology preparation assembles the native grid and eight channel bytes per sample: 1.5 GiB keeps 4097² (about 240 MB tracked) far inside the limit. */
export const COASTAL_V3_GEOLOGY_LIMIT_BYTES = 1536 * 1024 * 1024;
const OBSERVER_POSES = Object.freeze(['NW-01', 'NW-08', 'NW-09']);
const PLAN_FILES = Object.freeze(['districts', 'roads', 'shoreline', 'beachPoints']);
const COASTAL_ZONE_CATALOG = Object.freeze(['inland', 'offshore', 'reef', 'bar', 'surf', 'swash', 'berm', 'backshore', 'foredune', 'platform', 'bluff toe', 'bluff face', 'bluff crown']
    .map((label, id) => ({ id, label, color: ['#d9d2c4', '#2d5f86', '#6b4e3d', '#c9a86a', '#3f93b8', '#8fd0e8', '#e8d9a8', '#cdbf8a', '#d4b36a', '#8e8a80', '#b0a48f', '#5e5348', '#9aa66e'][id] })));
const DEPOSIT_CATALOG = Object.freeze(['none', 'talus', 'colluvium', 'alluvium', 'beach sand', 'dune sand', 'reef rock'].map((label, id) => ({ id, label, color: ['#e9e4d8', '#7a6a5a', '#9c8a6e', '#c8b27a', '#e6d7a6', '#efe2b4', '#6c7a62'][id] })));
const DRAINAGE_CATALOG = Object.freeze(['hillslope', 'rill', 'gully', 'channel', 'flat/pond', 'sea'].map((label, id) => ({ id, label, color: ['#e9e4d8', '#9fc7dc', '#4f9bc4', '#1f5f9c', '#7a9c7a', '#2d5f86'][id] })));
const seconds = started => (performance.now() - started) / 1000;
const round3 = value => Math.round(value * 1e3) / 1e3;

async function readPlan(root, recipe) {
    const plan = {};
    for (const name of PLAN_FILES) plan[name] = JSON.parse(await readFile(path.resolve(root, recipe.inputs.plan[name]), 'utf8'));
    return plan;
}

// observers from the review poses: eye heights above the measured ground (altitude poses convert through the local ground)
function poseObservers(poses, grid, heights) {
    return OBSERVER_POSES.map(id => {
        const pose = poses.poses.find(entry => entry.id === id);
        if (!pose || pose.camera) throw new Error(`[CoastalV3] pose ${id} must be an eye-height or altitude pose`);
        const ground = sampleBilinear(grid, heights, pose.x, pose.z);
        return { id, x: pose.x, z: pose.z, eyeHeightMeters: pose.eyeHeightMeters ?? pose.altitudeMeters - ground, headingDegrees: pose.headingDegrees, halfAngleDegrees: 90 };
    });
}

// the v2 cover on the measured grid (nearest label when the measured grid is finer): the planning-class comparison of the constraint report
async function sourceCoverOn(root, recipe, grid, signal) {
    const directory = path.resolve(root, recipe.inputs.landscape.directory), saved = await readLandscapeFileManifest(directory, 'manifest.json', { signal }), memory = new TerrainFieldMemory(256 << 20);
    const source = await readTerrainFieldSource(directory, saved.manifest, memory, { signal }), factor = upsampleFactor(source.grid, grid);
    if (factor === null) throw new Error(`[CoastalV3] the v2 grid (${source.grid.columns} at ${source.grid.spacingX} m) does not refine onto the measured grid (${grid.columns} at ${grid.spacingX} m)`);
    const cover = new Uint8Array(grid.columns * grid.rows);
    upsampleCover(source.grid, source.cover, grid, cover);
    memory.free('source/heights', 'source/cover');
    return { cover, revision: saved.manifest.revision, factor };
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

async function renderReview(outputRoot, measured, layers, diagnosis, plan, targets, seaLevel, thumbnails, log) {
    const { grid, heights, cover } = measured, size = 1024, images = {};
    const write = async (name, image) => { const file = path.join(outputRoot, `${name}.png`); await writeReviewPng(file, image); images[name] = file; log(`[CoastalV3] rendered ${name}`); };
    await write('hillshade', renderHillshade(grid, heights, { size, seaLevel }));
    await write('hillshade-multi', renderMultidirectionalHillshade(grid, heights, { size, seaLevel }));
    await write('slope', renderSlopeMap(grid, heights, { size, seaLevel, workingLimitBytes: COASTAL_V3_MEMORY_LIMIT_BYTES }));
    await write('elevation', renderElevationMap(grid, heights, { size, seaLevel }));
    const relief = localRelief(grid, heights, cover, { seaLevel, windowsMeters: [100, 500] });
    for (const window of relief.windows) await write(`relief-${window.meters}m`, renderReliefMap(grid, window.raster, { size, maxMeters: Math.max(1, window.natural.max), label: `local relief over ${window.meters} m (max ${window.natural.max.toFixed(1)} m)` }));
    await write('coastal-zones', renderCoverMap(grid, layers.coastalZone, { size, catalog: COASTAL_ZONE_CATALOG }));
    await write('deposits', renderCoverMap(grid, layers.depositType, { size, catalog: DEPOSIT_CATALOG }));
    await write('drainage', renderCoverMap(grid, layers.drainage, { size, catalog: DRAINAGE_CATALOG }));
    await write('cover', renderCoverMap(grid, cover, { size }));
    if (measured.sourceCover) await write('cover-source', renderCoverMap(grid, measured.sourceCover, { size }));
    await write('operators', composeSheet(thumbnails, { columns: 6 }));
    const points = plan.shoreline.points_xyz_m, labels = { coastalZone: layers.coastalZone };
    const series = (zs, seaward, landward) => zs.map(z => { const t = shoreTransect(grid, heights, seaLevel, points, z, { seawardMeters: seaward, landwardMeters: landward, labels }); return { label: `Z ${z}`, distance: Array.from(t.stations.d), height: Array.from(t.stations.height) }; });
    await write('profiles-beach', renderProfilePlot({ title: 'Beach transects (0 = design shoreline, +X landward)', verticalExaggeration: 8, seaLevel, xLabel: 'distance from design shoreline (m)', yLabel: 'height (m)', series: series(targets.transects.beachZ.filter((z, i) => i % 2 === 0), 200, 160) }));
    await write('profiles-bathymetry', renderProfilePlot({ title: 'Bathymetry transects: Dean profile, shelf, bar (0 = design shoreline)', verticalExaggeration: 12, seaLevel, xLabel: 'distance from design shoreline (m)', yLabel: 'height (m)', series: series([600, 1500, 2400, 3300], 1100, 40), markers: [{ distance: -8 / targets.bathymetry.deanA[1], label: '' }] }));
    await write('profiles-bluff', renderProfilePlot({ title: 'West cliff transects: platform and face (0 = design shoreline)', verticalExaggeration: 4, seaLevel, xLabel: 'distance from design shoreline (m)', yLabel: 'height (m)', series: series(targets.transects.bluffZ.filter((z, i) => i % 3 === 1), 40, 200), markers: targets.westCliff.bandMeters.map(distance => ({ distance, label: `${distance} m` })) }));
    await write('profiles-rim', renderProfilePlot({ title: 'High-city rim profiles from the plateau centroid', verticalExaggeration: 4, seaLevel, xLabel: 'distance from centroid (m)', yLabel: 'height (m)', series: diagnosis.edges.profiles.map(p => ({ label: p.id, distance: p.distance, height: p.height })) }));
    await write('profile-route-ab', renderProfilePlot({ title: 'A-B route: beach arrival to high city', verticalExaggeration: 10, seaLevel, xLabel: 'distance along route (m)', yLabel: 'height (m)', series: [{ label: 'route centerline height', distance: diagnosis.route.stations.distance, height: diagnosis.route.stations.height }], markers: diagnosis.route.parts.map(part => ({ distance: part.startDistance, label: part.name })) }));
    await write('slope-histogram', renderHistogramPlot({ title: 'Slope histogram of natural land', bins: diagnosis.slope.bins.map(bin => bin.label), percent: true, series: [{ label: 'natural land', values: diagnosis.slope.natural.fractions }, { label: 'all land', values: diagnosis.slope.land.fractions }] }));
    return images;
}

// the replay of accepted edit batches from a previous saved landscape through the authoring module another workstream provides
async function replayEditsFrom({ root, previousDirectory, directory, signal, log }) {
    let module;
    try { module = await import('../../../landscape_authoring/BatchReplay.mjs'); }
    catch (error) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
        log('[CoastalV3] edit replay requested but tools/landscape_authoring/BatchReplay.mjs is not available; skipped');
        return { requested: previousDirectory, status: 'not-available', result: null };
    }
    if (typeof module.replayAcceptedBatches !== 'function') { log('[CoastalV3] BatchReplay.mjs exports no replayAcceptedBatches; skipped'); return { requested: previousDirectory, status: 'not-available', result: null }; }
    const result = await module.replayAcceptedBatches({ previousDirectory: path.resolve(root, previousDirectory), directory, signal, log });
    return { requested: previousDirectory, status: 'replayed', result };
}

/**
 * @param {{root:string,recipeFile?:string,fieldsRecipeFile?:string,outputRoot:string,working?:'native'|'1953',landscapeRoot?:string|null,fields?:'bake'|'none',geology?:'publish'|'none',replayEdits?:string,poseFile?:string,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function runCoastalV3({ root, recipeFile = COASTAL_V3_RECIPE, fieldsRecipeFile = COASTAL_V3_FIELDS_RECIPE, outputRoot, working = 'native', landscapeRoot = null, fields = 'bake', geology = 'publish', replayEdits = 'none', poseFile = COASTAL_V3_POSES, signal, log = () => {} }) {
    const started = performance.now(), timing = {};
    if (!Object.hasOwn(COASTAL_V3_WORKING_MODES, working)) throw new Error(`[CoastalV3] working must be one of ${Object.keys(COASTAL_V3_WORKING_MODES).join(', ')}`);
    const recipeBytes = await readFile(path.resolve(root, recipeFile)), recipeSha256 = authoringHash(recipeBytes), declared = validateLandscapeSynthesisRecipe(JSON.parse(recipeBytes.toString('utf8')));
    const workingSpacing = COASTAL_V3_WORKING_MODES[working], recipe = workingSpacing === null ? declared : validateLandscapeSynthesisRecipe({ ...structuredClone(declared), working: { spacing: workingSpacing } });
    const plan = await readPlan(root, recipe), poses = await loadReviewPoses(path.resolve(root, poseFile)), seaLevel = recipe.seaLevel;
    const operatorsDirectory = path.join(outputRoot, 'operators'), exportRoot = path.join(outputRoot, 'exports'), geologyCandidate = path.join(outputRoot, 'geology-candidate');
    const landscapeDirectory = landscapeRoot ? path.resolve(root, landscapeRoot, COASTAL_V3_LANDSCAPE_ID) : path.join(outputRoot, 'landscape');
    if (path.resolve(landscapeDirectory) === path.resolve(root, LANDSCAPE_DEFAULT_DIRECTORY) || path.resolve(landscapeDirectory) === path.resolve(root, recipe.inputs.landscape.directory)) throw new Error('[CoastalV3] the v3 landscape may not overwrite the v2 source directory');
    for (const directory of [operatorsDirectory, exportRoot, geologyCandidate]) await rm(directory, { recursive: true, force: true });
    if (!landscapeRoot) await rm(landscapeDirectory, { recursive: true, force: true });
    await mkdir(operatorsDirectory, { recursive: true }); await mkdir(exportRoot, { recursive: true });
    log(`[CoastalV3] recipe ${recipe.id} (${recipeSha256.slice(0, 12)}) on ${recipe.grid.columns}² at ${recipe.grid.spacingX} m${workingSpacing ? `, working grid ${workingSpacing} m` : ''}; landscape -> ${landscapeDirectory}`);
    // synthesis
    const memory = new TerrainFieldMemory(COASTAL_V3_MEMORY_LIMIT_BYTES), thumbnails = [], operatorSeconds = [];
    let mark = performance.now();
    const result = await executeSynthesisRecipe({ recipe, inputs: { root, exportRoot }, memory, signal, log,
        onProgress: event => { if (event.phase === 'done') { operatorSeconds.push({ id: event.id, seconds: event.seconds }); log(`[CoastalV3] ${event.index + 1}/${event.count} ${event.id} (${event.op}) ${event.seconds.toFixed(1)} s, ${(memory.bytes / 1048576).toFixed(0)} MB tracked (peak ${(memory.peakBytes / 1048576).toFixed(0)} MB), ${seconds(mark).toFixed(0)} s elapsed`); } },
        onOperator: async ({ index, id, grid, layers }) => {
            const image = renderHillshade(grid, layers.get('height'), { size: 256, seaLevel }), label = `${String(index + 1).padStart(2, '0')} ${id}`;
            thumbnails.push({ image, label });
            await writeReviewPng(path.join(operatorsDirectory, `${String(index + 1).padStart(2, '0')}-${id}.png`), image);
        } });
    timing.synthesisSeconds = seconds(mark);
    try {
        const { report } = result, coarse = report.resampled;
        // measurements on the grid the operators ran on (the layers live there); the native run measures the output grid itself
        const measured = coarse ? { grid: result.workingGrid, heights: result.layers.height, cover: result.layers.cover, where: 'working grid' } : { grid: result.grid, heights: result.heights, cover: result.cover, where: 'output grid' };
        log(`[CoastalV3] engine ${report.totalSeconds.toFixed(1)} s, peak tracked ${(memory.peakBytes / 1048576).toFixed(0)} MB; measuring on the ${measured.where} (${measured.grid.columns}² at ${measured.grid.spacingX} m)`);
        mark = performance.now();
        const source = await sourceCoverOn(root, recipe, measured.grid, signal);
        measured.sourceCover = source.cover;
        const observers = poseObservers(poses, measured.grid, measured.heights);
        const diagnosis = diagnoseRelief(measured.grid, measured.heights, measured.cover, seaLevel, plan, { label: recipe.id, log, constraints: { highCityTargetMeters: 80, sourceCover: source.cover }, sets: { observers }, workingLimitBytes: COASTAL_V3_MEMORY_LIMIT_BYTES,
            landscape: { recipe: recipeFile, identity: report.identity, measuredOn: measured.where } });
        timing.diagnosisSeconds = seconds(mark);
        mark = performance.now();
        const measurements = measureCoastalV3(measured.grid, measured.heights, measured.cover, { coastalZone: result.layers.coastalZone, faceMask: result.layers.faceMask }, seaLevel, plan, diagnosis, { workingLimitBytes: COASTAL_V3_MEMORY_LIMIT_BYTES, log });
        const districtProfiles = recipeDistrictProfiles(recipe, plan.districts), targets = evaluateCoastalV3({ diagnosis, measurements, planRoadCount: plan.roads.roads.length, districtProfiles });
        const needles = needleStatistics(measured.grid, measured.heights, 2);
        timing.measurementSeconds = seconds(mark);
        log(`[CoastalV3] targets ${targets.passed ? 'PASS' : `FAIL: ${targets.failed.join(', ')}`}; needles ${needles.count}`);
        await writeFile(path.join(outputRoot, 'diagnosis.json'), JSON.stringify(diagnosis, null, 1));
        await writeFile(path.join(outputRoot, 'diagnosis.md'), reliefDiagnosisMarkdown(diagnosis));
        await writeFile(path.join(outputRoot, 'measurements.json'), JSON.stringify(measurements, null, 1));
        await writeFile(path.join(outputRoot, 'targets.json'), JSON.stringify(targets, null, 1));
        await writeFile(path.join(outputRoot, 'targets.md'), coastalV3TargetsMarkdown(targets));
        await writeFile(path.join(outputRoot, 'engine-report.json'), JSON.stringify(report, null, 1));
        // review images
        mark = performance.now();
        const images = await renderReview(outputRoot, measured, result.layers, diagnosis, plan, COASTAL_V3_TARGETS, seaLevel, thumbnails, log);
        timing.renderSeconds = seconds(mark);
        // the saved landscape: references from v2, no appearance (the grid changed), fields re-baked under the v3 recipe
        mark = performance.now();
        log(`[CoastalV3] writing ${COASTAL_V3_LANDSCAPE_ID} to ${landscapeDirectory} (references copy-all, appearance none, fields ${fields})`);
        const written = await writeSynthesizedLandscape({ sourceDirectory: path.resolve(root, recipe.inputs.landscape.directory), outputDirectory: landscapeDirectory, grid: result.grid, heights: result.heights, cover: result.cover,
            id: COASTAL_V3_LANDSCAPE_ID, name: 'Coastal City Terrain v3', revisionLabel: `${recipe.id}-${report.identity.slice(-8)}`,
            provenance: { sourceName: `${recipe.id} synthesized from coastal_city_terrain_v2 (${source.revision}, ${source.factor}x upsampled base) by landscape-synthesis-v1`, preparation: { importResample: report.operators[0]?.statistics?.importResample ?? null, workingSpacingMeters: report.working.spacing } },
            synthesis: { recipeId: recipe.id, identity: report.identity, recipeSha256, sourceSpacingMeters: report.working.spacing },
            references: 'copy-all', appearance: 'none', fields, fieldsRecipeFile: path.resolve(root, fieldsRecipeFile), chunkIntervals: recipe.grid.chunkIntervals, maxLevel: recipe.grid.maxLevel, seaLevel, signal, log });
        timing.landscapeSeconds = seconds(mark);
        const snapshot = `manifest.${written.manifestSha256}.json`;
        log(`[CoastalV3] landscape ${written.revision} written (${written.files.length} files, snapshot ${snapshot}) in ${timing.landscapeSeconds.toFixed(1)} s`);
        // geology: prepared from the exact published grid, validated, published manifest-last under the authoring lock (native runs only: the layers live on the output grid there)
        mark = performance.now();
        let geologyReport = null;
        if (geology === 'publish' && coarse) { log('[CoastalV3] geology skipped: the working-grid iteration keeps its layers on the working grid; a native run publishes the sidecar'); geologyReport = { status: 'skipped-working-grid' }; }
        else if (geology === 'publish') {
            const saved = await readLandscapeFileManifest(landscapeDirectory, 'manifest.json', { signal }), geologyLayers = Object.fromEntries(LANDSCAPE_GEOLOGY_LAYERS.map(name => [name, result.layers[name]]));
            const prepared = await prepareLandscapeGeology({ directory: landscapeDirectory, outputDirectory: geologyCandidate, source: saved, layers: geologyLayers, grid: result.grid, heights: result.heights,
                provenance: { recipeIdentity: report.identity, recipeSha256 }, verifyDeterminism: true, workingLimitBytes: COASTAL_V3_GEOLOGY_LIMIT_BYTES, signal, log });
            const validation = await validateLandscapeGeologyCandidate(prepared);
            const release = await acquireAuthoringLock(landscapeDirectory);
            let installed;
            try { installed = await publishLandscapeGeology(prepared); } finally { await release(); }
            geologyReport = { status: 'published', revision: prepared.report.revision, sidecarBytes: prepared.report.sidecarBytes, pages: prepared.report.pages, determinism: prepared.report.determinism, statistics: prepared.report.statistics, timing: prepared.report.timing, memory: prepared.report.memory,
                checks: validation.checks, installedFiles: installed.length, manifest: path.join(landscapeDirectory, 'geology', 'manifest.json') };
            log(`[CoastalV3] geology ${prepared.report.revision} published (${installed.length} files, ${prepared.report.pages.count} pages)`);
        } else geologyReport = { status: 'none' };
        timing.geologySeconds = seconds(mark);
        // optional replay of accepted edit batches from a previous saved landscape
        mark = performance.now();
        const replay = replayEdits === 'none' ? { requested: null, status: 'none', result: null } : await replayEditsFrom({ root, previousDirectory: replayEdits, directory: landscapeDirectory, signal, log });
        timing.replaySeconds = seconds(mark);
        const bytes = await directoryBytes(landscapeDirectory), coverStatistics = report.operators.find(entry => entry.op === 'derive-land-cover')?.statistics ?? null;
        timing.totalSeconds = seconds(started);
        const receipt = { format: COASTAL_V3_FORMAT, schemaVersion: 1, passed: targets.passed, failed: targets.failed,
            recipe: { file: recipeFile, id: recipe.id, sha256: recipeSha256, identity: report.identity, seed: recipe.seed, grid: recipe.grid, workingMode: working, workingOverride: workingSpacing !== null ? { spacing: workingSpacing } : null, working: report.working, resampled: coarse, resampleFilter: report.resampleFilter, inputs: report.inputs },
            measuredOn: { where: measured.where, columns: measured.grid.columns, rows: measured.grid.rows, spacing: measured.grid.spacingX, sourceCoverRevision: source.revision, sourceCoverFactor: source.factor },
            targets, districtProfiles, needles, diagnosisSummary: { heights: diagnosis.heights, slope: { natural: diagnosis.slope.natural.percentiles, above10: diagnosis.slope.natural.fractions.slice(3).reduce((a, b) => a + b, 0), above20: diagnosis.slope.natural.atLeast20Degrees.fraction, above30: diagnosis.slope.natural.atLeast30Degrees.fraction },
                relief: diagnosis.relief.windows.map(window => ({ meters: window.meters, p90: window.natural.p90, max: window.natural.max })), incision: { p90: diagnosis.incision.incision.p90, max: diagnosis.incision.incision.max, lines: diagnosis.incision.lines.count, networks: diagnosis.incision.networks },
                subtended: diagnosis.subtended.observers.map(o => ({ id: o.id, maxElevationDegrees: o.maxElevationDegrees, aboveHorizonDegrees: o.aboveHorizonDegrees })), constraints: { passed: diagnosis.constraints.passed, failedChecks: diagnosis.constraints.failedChecks } },
            landCover: coverStatistics ? { rules: coverStatistics.rules, decidedByRule: coverStatistics.decidedByRule, samples: coverStatistics.samples, changedSamples: coverStatistics.changedSamples, totals: coverStatistics.totals, matrix: coverStatistics.matrix, outputCover: report.outputCover } : null,
            engine: { operators: report.operators.map(({ id, op, seconds }) => ({ id, op, seconds })), totalSeconds: report.totalSeconds, outputSeconds: report.outputSeconds, peakTrackedBytes: memory.peakBytes, peakPhase: memory.peakPhase, limitBytes: COASTAL_V3_MEMORY_LIMIT_BYTES, importResample: report.operators[0]?.statistics?.importResample ?? null,
                coastal: Object.fromEntries(report.operators.filter(entry => ['coastal-bluff', 'coastal-beach', 'coastal-foredune', 'coastal-nearshore', 'coastal-reef'].includes(entry.op)).map(entry => [entry.id, summarizeCoastal(entry)])) },
            landscape: { directory: landscapeDirectory, id: COASTAL_V3_LANDSCAPE_ID, published: !!landscapeRoot, revision: written.revision, contentRevision: written.contentRevision, manifestSha256: written.manifestSha256, manifestSnapshot: snapshot, heightsSha256: written.heightsSha256, coverSha256: written.coverSha256,
                files: written.files.length, nodes: written.manifest.chunks.length, references: written.references.length, timing: written.timing, hierarchy: { builds: written.hierarchy.builds?.length ?? null, levels: written.hierarchy.builds?.[written.hierarchy.builds.length - 1]?.levels ?? null },
                fields: written.fields ? { revision: written.fields.revision, pages: written.fields.pages, timing: written.fields.timing, determinism: written.fields.determinism?.verified ?? null, recipe: written.fields.recipe } : null, bytes },
            geology: geologyReport, replay, images, timing };
        await writeFile(path.join(outputRoot, 'coastal-v3.json'), JSON.stringify(receipt, null, 1));
        await writeFile(path.join(outputRoot, 'coastal-v3.md'), coastalV3Markdown(receipt));
        return receipt;
    } finally { result.release(); }
}

const summarizeCoastal = entry => {
    const s = entry.statistics;
    if (entry.op === 'coastal-bluff') return { faceSamples: s.faceSamples, platformSamples: s.platformSamples, cutVolumeCubicMeters: s.cutVolumeCubicMeters, talusHeightMeters: s.talusHeightMeters, coastLengthMeters: s.coastLengthMeters, shoreline: s.shoreline };
    if (entry.op === 'coastal-beach') return { deanA: s.deanA, deanOriginMeters: s.deanOriginMeters, deanDepthDistanceMeters: s.deanDepthDistanceMeters, shelfFloorDistanceMeters: s.shelfFloorDistanceMeters, transectSummary: s.transectSummary, raisedSamples: s.raisedSamples, loweredSamples: s.loweredSamples, fillVolumeCubicMeters: s.fillVolumeCubicMeters, cutVolumeCubicMeters: s.cutVolumeCubicMeters, zoneSamples: s.zoneSamples, shoreline: s.shoreline };
    if (entry.op === 'coastal-foredune') return { stations: s.stations, stationsWithRoom: s.stationsWithRoom, duneSamples: s.duneSamples, maxCrestMeters: s.maxCrestMeters, effectiveHeightMeters: s.effectiveHeightMeters, protectedSamples: s.protectedSamples };
    if (entry.op === 'coastal-nearshore') return { crest: s.crest, barSamples: s.barSamples, locatedStations: s.locatedStations, stations: s.stations };
    return { reefSamples: s.reefSamples, reefTopDepthMeters: s.reefTopDepthMeters, swimZone: s.swimZone, zonedSamples: s.zonedSamples };
};

const f = (value, digits = 2) => (value === null || value === undefined ? 'n/a' : typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(digits) : String(value)) : String(value));
const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`;

/** @param {any} receipt */
export function coastalV3Markdown(receipt) {
    const lines = [`# Coastal terrain v3 (${receipt.recipe.id}): ${receipt.passed ? 'PASS' : `FAIL (${receipt.failed.join(', ')})`}`, '',
        `Recipe ${receipt.recipe.file} (sha256 ${receipt.recipe.sha256.slice(0, 12)}, identity ${receipt.recipe.identity}); operators on ${receipt.recipe.working.columns}² at ${receipt.recipe.working.spacing} m (${receipt.recipe.workingMode}${receipt.recipe.resampled ? `, resampled ${receipt.recipe.resampleFilter} to ${receipt.recipe.grid.columns}²` : ''}); measured on the ${receipt.measuredOn.where}; engine ${f(receipt.engine.totalSeconds, 1)} s, peak tracked ${mb(receipt.engine.peakTrackedBytes)} (${receipt.engine.peakPhase}, limit ${mb(receipt.engine.limitBytes)}); total ${f(receipt.timing.totalSeconds, 1)} s.`, '',
        `Landscape ${receipt.landscape.id} ${receipt.landscape.published ? 'published to' : 'written under'} ${receipt.landscape.directory}: revision ${receipt.landscape.revision}, snapshot ${receipt.landscape.manifestSnapshot}, ${receipt.landscape.nodes} nodes, ${receipt.landscape.files} files written, ${mb(receipt.landscape.bytes.total)} on disk (${Object.entries(receipt.landscape.bytes.byFolder).map(([key, value]) => `${key} ${mb(value)}`).join(', ')}); fields ${receipt.landscape.fields ? `${receipt.landscape.fields.revision} (${receipt.landscape.fields.pages.count} pages, ${f(receipt.landscape.fields.timing?.totalSeconds, 1)} s)` : 'none'}; geology ${receipt.geology.status}${receipt.geology.revision ? ` ${receipt.geology.revision} (${receipt.geology.pages.count} pages, ${f(receipt.geology.timing.totalSeconds, 1)} s)` : ''}; edit replay ${receipt.replay.status}.`, ''];
    lines.push('## Declared targets and hard constraints', '', ...coastalV3TargetsMarkdown(receipt.targets).split('\n').slice(2));
    lines.push('## Timings (s)', '', '| step | seconds |', '| --- | ---: |', ...Object.entries(receipt.timing).map(([key, value]) => `| ${key} | ${f(value, 1)} |`), ...Object.entries(receipt.landscape.timing).map(([key, value]) => `| landscape ${key} | ${f(value, 1)} |`), '');
    lines.push('| operator | seconds |', '| --- | ---: |', ...receipt.engine.operators.map(entry => `| ${entry.id} (${entry.op}) | ${f(entry.seconds, 2)} |`), '');
    if (receipt.landCover) {
        const ids = [...new Set([...Object.keys(receipt.landCover.totals)])].map(Number).sort((a, b) => a - b);
        lines.push('## Land cover derivation', '', `Rules: ${JSON.stringify(receipt.landCover.rules)}; decided by rule: ${JSON.stringify(receipt.landCover.decidedByRule)}; ${receipt.landCover.changedSamples} of ${receipt.landCover.samples} samples changed class; output cover ${JSON.stringify(receipt.landCover.outputCover)}.`, '',
            '| class | before | after | delta |', '| --- | ---: | ---: | ---: |', ...ids.map(id => `| ${id} | ${receipt.landCover.totals[id].before} | ${receipt.landCover.totals[id].after} | ${receipt.landCover.totals[id].delta} |`), '',
            `| from \\ to | ${ids.join(' | ')} |`, `| --- | ${ids.map(() => '---:').join(' | ')} |`, ...ids.filter(from => receipt.landCover.matrix[from]).map(from => `| ${from} | ${ids.map(to => receipt.landCover.matrix[from][to] ?? 0).join(' | ')} |`), '');
    }
    lines.push('## Images', '', ...Object.entries(receipt.images).map(([name, file]) => `- ${name}: ${file}`), '');
    return lines.join('\n');
}
