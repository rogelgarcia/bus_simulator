// Runs the D1 relief study: diagnoses a saved terrain and synthesizes, measures, renders and optionally publishes coarse relief variants.
// @ts-check
// Every variant is one authored recipe. The study executes it on the working grid, measures the output with the same diagnosis the
// retained terrain gets (slope, relief, incision, beach and rim profiles, subtended angles, the A-B route and the plan constraint
// report), renders hillshades, slope and elevation maps and profile plots, and can write the variant as a saved landscape directory
// (appearance copied, fields baked) so the viewer renders it at the pinned review poses. Observers for the subtended angles come from
// the review pose file, so the study measures exactly what the captures show.
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { readTerrainFieldSource } from '../../terrain_fields/TerrainFieldsSource.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { authoringHash } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { executeSynthesisRecipe } from '../SynthesisGraph.mjs';
import { diagnoseRelief, reliefDiagnosisMarkdown, localRelief, sampleBilinear } from '../SynthesisAnalysis.mjs';
import { renderHillshade, renderMultidirectionalHillshade, renderSlopeMap, renderReliefMap, renderElevationMap, renderProfilePlot, renderHistogramPlot, writeReviewPng } from '../SynthesisReview.mjs';
import { writeSynthesizedLandscape } from '../SynthesisLandscape.mjs';
import { loadReviewPoses } from '../../../landscape_review/ReviewPoses.mjs';
import { validateLandscapeSynthesisRecipe } from '../../../../src/app/landscape/index.js';

export const RELIEF_STUDY_FORMAT = 'landscape-relief-study';
export const RELIEF_STUDY_OBSERVER_POSES = Object.freeze(['NW-01', 'NW-08', 'NW-09']);
const PLAN_FILES = Object.freeze(['districts', 'roads', 'shoreline', 'beachPoints']);

/** @param {string} root @param {any} recipe */
async function readPlan(root, recipe) {
    const plan = {};
    for (const name of PLAN_FILES) plan[name] = JSON.parse(await readFile(path.resolve(root, recipe.inputs.plan[name]), 'utf8'));
    return plan;
}

/** Observers from the review poses: eye heights above the ground of the measured grid (altitude poses convert through the local ground). */
function poseObservers(poses, grid, heights, ids) {
    return ids.map(id => {
        const pose = poses.poses.find(entry => entry.id === id);
        if (!pose || pose.camera) throw new Error(`[ReliefStudy] pose ${id} must be an eye-height or altitude pose`);
        const ground = sampleBilinear(grid, heights, pose.x, pose.z);
        const eyeHeightMeters = pose.eyeHeightMeters ?? pose.altitudeMeters - ground;
        return { id, x: pose.x, z: pose.z, eyeHeightMeters, headingDegrees: pose.headingDegrees, halfAngleDegrees: 90 };
    });
}

/** @param {string} directory @param {{columns:number,rows:number}} grid @param {Float32Array} heights @param {Uint8Array} cover @param {any} doc @param {number} seaLevel */
async function renderReviewImages(directory, grid, heights, cover, doc, seaLevel) {
    await mkdir(directory, { recursive: true });
    const size = 1024, files = {};
    const write = async (name, image) => { const file = path.join(directory, `${name}.png`); await writeReviewPng(file, image); files[name] = file; };
    await write('hillshade', renderHillshade(grid, heights, { size, seaLevel }));
    await write('hillshade-multi', renderMultidirectionalHillshade(grid, heights, { size, seaLevel }));
    await write('slope', renderSlopeMap(grid, heights, { size, seaLevel }));
    await write('elevation', renderElevationMap(grid, heights, { size, seaLevel }));
    const relief = localRelief(grid, heights, cover, { seaLevel, windowsMeters: [100, 500] });
    for (const window of relief.windows) await write(`relief-${window.meters}m`, renderReliefMap(grid, window.raster, { size, maxMeters: Math.max(1, window.natural.max), label: `local relief over ${window.meters} m (max ${window.natural.max.toFixed(1)} m)` }));
    await write('profiles-beach', renderProfilePlot({ title: 'Beach transects (0 = design shoreline, +X landward)', verticalExaggeration: 8, seaLevel, xLabel: 'distance from design shoreline (m)', yLabel: 'height (m)',
        series: doc.beach.transects.map(t => ({ label: `${t.id} (Z ${t.z})`, distance: t.stations.x.map(x => x - (t.shorelineX ?? t.xStart + 200)), height: t.stations.height })) }));
    await write('profile-route-ab', renderProfilePlot({ title: 'A-B route: beach arrival to high city', verticalExaggeration: 10, seaLevel, xLabel: 'distance along route (m)', yLabel: 'height (m)',
        series: [{ label: 'route centerline height', distance: doc.route.stations.distance, height: doc.route.stations.height }], markers: doc.route.parts.map(part => ({ distance: part.startDistance, label: part.name })) }));
    await write('edge-profiles', renderProfilePlot({ title: 'High-city rim profiles from the plateau centroid', verticalExaggeration: 4, seaLevel, xLabel: 'distance from centroid (m)', yLabel: 'height (m)',
        series: doc.edges.profiles.map(p => ({ label: p.id, distance: p.distance, height: p.height })) }));
    await write('slope-histogram', renderHistogramPlot({ title: 'Slope histogram of natural land', bins: doc.slope.bins.map(bin => bin.label), percent: true,
        series: [{ label: 'natural land', values: doc.slope.natural.fractions }, { label: 'all land', values: doc.slope.land.fractions }] }));
    return files;
}

/** Key numbers of one diagnosis for the study summary. @param {any} doc */
export function reliefStudySummary(doc) {
    const natural = doc.slope.natural, relief = Object.fromEntries(doc.relief.windows.map(window => [`${window.meters}m`, { p50: window.natural.p50, p90: window.natural.p90, max: window.natural.max }]));
    return { heights: doc.heights, slope: { mean: natural.mean, p50: natural.percentiles.p50, p90: natural.percentiles.p90, p99: natural.percentiles.p99, max: natural.percentiles.p100,
        above10Fraction: natural.fractions.slice(3).reduce((a, b) => a + b, 0), above20Fraction: natural.atLeast20Degrees.fraction, above30Fraction: natural.atLeast30Degrees.fraction },
        relief, incision: { channelSamples: doc.incision.channelSamples, networks: doc.incision.networks, mean: doc.incision.incision.mean, p90: doc.incision.incision.p90, max: doc.incision.incision.max },
        beach: doc.beach.transects.map(t => ({ id: t.id, foreshoreSlopeDegrees: t.foreshoreSlopeDegrees, sandWidthMeters: t.sandWidthMeters, berm: t.berm, riseAbove3m: t.riseAbove3m ? { distance: t.riseAbove3m.distanceFromCrossing, slopeNext20m: t.riseAbove3m.slopeDegreesNext20m } : null })),
        rim: doc.edges.profiles.map(p => ({ id: p.id, dropMeters: p.dropMeters, steepestDegrees: p.steepest.slopeDegrees })),
        subtended: doc.subtended.observers.map(o => ({ id: o.id, maxElevationDegrees: o.maxElevationDegrees, aboveHorizonDegrees: o.aboveHorizonDegrees })),
        route: { climb: doc.route.totalClimbMeters, maxGrade20m: doc.route.windows.find(w => w.meters === 20)?.maxGradePercent, maxGrade50m: doc.route.windows.find(w => w.meters === 50)?.maxGradePercent },
        constraints: { passed: doc.constraints.passed, failedChecks: doc.constraints.failedChecks, maxSustainedGradePercent: doc.constraints.roads.maxSustainedGradePercent, maxShortGradePercent: doc.constraints.roads.maxShortGradePercent,
            roadsWithViolations: doc.constraints.roads.roadsWithViolations, shorelineMaxDeviation: doc.constraints.shoreline.maxDeviationMeters,
            districts: doc.constraints.districts.districts.map(d => ({ id: d.id, name: d.name, p05: d.heights.p05, p95: d.heights.p95, withinBand: d.withinBand, passed: d.passed })) } };
}

/**
 * Diagnoses the retained terrain of a saved landscape directory.
 * @param {{root:string,directory:string,outputDirectory:string,poses:any,plan:any,label:string,constraints?:object,log?:(message:string)=>void}} options
 */
export async function diagnoseSavedTerrain({ root, directory, outputDirectory, poses, plan, label, constraints = {}, log = () => {} }) {
    const saved = await readLandscapeFileManifest(path.resolve(root, directory)), memory = new TerrainFieldMemory(1024 << 20);
    const source = await readTerrainFieldSource(path.resolve(root, directory), saved.manifest, memory);
    const seaLevel = saved.manifest.coordinates.seaLevel, observers = poseObservers(poses, source.grid, source.heights, RELIEF_STUDY_OBSERVER_POSES);
    const doc = diagnoseRelief(source.grid, source.heights, source.cover, seaLevel, plan, { label, log, constraints, sets: { observers },
        landscape: { directory, revision: saved.manifest.revision, manifestSha256: authoringHash(saved.bytes) } });
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, 'diagnosis.json'), JSON.stringify(doc, null, 1));
    await writeFile(path.join(outputDirectory, 'diagnosis.md'), reliefDiagnosisMarkdown(doc));
    const images = await renderReviewImages(outputDirectory, source.grid, source.heights, source.cover, doc, seaLevel);
    memory.free('source/heights', 'source/cover');
    return { label, revision: saved.manifest.revision, summary: reliefStudySummary(doc), images, timing: doc.timing };
}

/**
 * Executes one variant recipe, measures and renders it, and optionally writes it as a saved landscape directory.
 * @param {{root:string,recipeFile:string,outputDirectory:string,poses:any,landscape?:{sourceDirectory:string,outputDirectory:string,fields:'bake'|'none'}|null,constraints?:object,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function synthesizeReliefVariant({ root, recipeFile, outputDirectory, poses, landscape = null, constraints = {}, signal, log = () => {} }) {
    const recipeBytes = await readFile(path.resolve(root, recipeFile)), recipe = validateLandscapeSynthesisRecipe(JSON.parse(recipeBytes.toString('utf8')));
    const plan = await readPlan(root, recipe), memory = new TerrainFieldMemory(1536 << 20), started = performance.now();
    const result = await executeSynthesisRecipe({ recipe, inputs: { root }, memory, signal, log });
    try {
        const { grid, heights, cover } = result, seaLevel = recipe.seaLevel, observers = poseObservers(poses, grid, heights, RELIEF_STUDY_OBSERVER_POSES);
        const doc = diagnoseRelief(grid, heights, cover, seaLevel, plan, { label: recipe.id, log, constraints, sets: { observers }, landscape: { recipe: recipeFile, identity: result.report.identity } });
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(path.join(outputDirectory, 'recipe.json'), recipeBytes);
        await writeFile(path.join(outputDirectory, 'engine-report.json'), JSON.stringify(result.report, null, 1));
        await writeFile(path.join(outputDirectory, 'diagnosis.json'), JSON.stringify(doc, null, 1));
        await writeFile(path.join(outputDirectory, 'diagnosis.md'), reliefDiagnosisMarkdown(doc));
        const images = await renderReviewImages(outputDirectory, grid, heights, cover, doc, seaLevel);
        let published = null;
        if (landscape) {
            const written = await writeSynthesizedLandscape({ sourceDirectory: path.resolve(root, landscape.sourceDirectory), outputDirectory: path.resolve(root, landscape.outputDirectory), grid, heights, cover,
                id: 'coastal-city', name: `Coastal City relief variant ${recipe.id}`, revisionLabel: `${recipe.id}-${result.report.identity.slice(-8)}`,
                provenance: { sourceName: `${recipe.id} synthesized from coastal_city_terrain_v2 by landscape-synthesis-v1`, recipeIdentity: result.report.identity, recipeSha256: authoringHash(recipeBytes), workingSpacingMeters: result.report.working.spacing },
                references: 'copy-planning', appearance: 'copy', fields: landscape.fields, signal, log });
            published = { directory: landscape.outputDirectory, revision: written.revision, manifestSha256: written.manifestSha256, fields: written.fields ? { revision: written.fields.revision, pages: written.fields.pages } : null, timing: written.timing };
            await writeFile(path.join(outputDirectory, 'landscape-receipt.json'), JSON.stringify({ ...published, files: written.files.length }, null, 1));
        }
        const heightsSha256 = authoringHash(Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength));
        return { id: recipe.id, recipeFile, identity: result.report.identity, heightsSha256, engine: { operators: result.report.operators.map(({ id, op, seconds }) => ({ id, op, seconds })), totalSeconds: result.report.totalSeconds, working: result.report.working, peakTrackedBytes: memory.peakBytes },
            summary: reliefStudySummary(doc), images, published, totalSeconds: (performance.now() - started) / 1000 };
    } finally { result.release(); }
}

/**
 * The whole study: the retained terrain diagnosis plus every variant, with one summary document.
 * @param {{root:string,sourceDirectory:string,recipeFiles:string[],outputRoot:string,poseFile:string,landscapeRoot?:string|null,fields?:'bake'|'none',constraints?:Record<string,object>,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function runReliefStudy({ root, sourceDirectory, recipeFiles, outputRoot, poseFile, landscapeRoot = null, fields = 'bake', constraints = {}, signal, log = () => {} }) {
    const poses = await loadReviewPoses(path.resolve(root, poseFile)), started = performance.now();
    const firstRecipe = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(path.resolve(root, recipeFiles[0]), 'utf8'))), plan = await readPlan(root, firstRecipe);
    log(`[ReliefStudy] diagnosing ${sourceDirectory}`);
    const source = await diagnoseSavedTerrain({ root, directory: sourceDirectory, outputDirectory: path.join(outputRoot, 'diagnosis'), poses, plan, label: 'coastal-city v2 (retained)', log });
    const variants = [];
    for (const recipeFile of recipeFiles) {
        signal?.throwIfAborted();
        const name = path.basename(recipeFile, '.json');
        log(`[ReliefStudy] synthesizing ${name}`);
        variants.push(await synthesizeReliefVariant({ root, recipeFile, outputDirectory: path.join(outputRoot, 'variants', name), poses, constraints: constraints[name] ?? {}, signal, log,
            landscape: landscapeRoot ? { sourceDirectory, outputDirectory: path.posix.join(landscapeRoot, `coastal-city-ai596-${name}`), fields } : null }));
    }
    const study = { format: RELIEF_STUDY_FORMAT, schemaVersion: 1, poseFile, poses: poses.id, source, variants, totalSeconds: (performance.now() - started) / 1000 };
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(outputRoot, 'relief-study.json'), JSON.stringify(study, null, 1));
    return study;
}
