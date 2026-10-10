// Runs the D2 gate: the synthetic 1 x 1 km plateau/road/shoreline fixture through every synthesis operator with determinism, constraint, relief, needle, geology, seam and interchange checks.
// @ts-check
// The fixture is the engine's acceptance test on terrain no one authored: an analytic base (FixtureBase), the committed plan under
// fixture/plan and the committed recipe exercise every operator family. The gate declares its targets as data (FIXTURE_GATE), runs the
// recipe twice (bit-identical hashes), measures the result with the same analysis the coastal studies use, writes the result as a
// standalone saved landscape (whose preparation verifies the chunk seams) plus a geology sidecar candidate (whose validation verifies
// page borders and halos), re-imports the exported height map, renders a hillshade after every operator, and writes one receipt. The base
// is generated at the recipe's grid, which must be one of the fixture spacings (fixtureGridOf), so the same gate runs the finer D3 recipes.
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TerrainFieldMemory } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../SynthesisGraph.mjs';
import { diagnoseRelief, needleStatistics, reliefDiagnosisMarkdown, shorelineXAt, polygonCentroid } from '../SynthesisAnalysis.mjs';
import { renderHillshade, renderMultidirectionalHillshade, renderSlopeMap, renderElevationMap, renderCoverMap, renderProfilePlot, composeSheet, writeReviewPng } from '../SynthesisReview.mjs';
import { writeSynthesizedLandscape } from '../SynthesisLandscape.mjs';
import { prepareLandscapeGeology, validateLandscapeGeologyCandidate } from '../geology/GeologyPreparation.mjs';
import { importLandscapeMap } from '../interchange/Interchange.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { authoringHash } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { createFixtureBase, fixtureGridForSpacing, FIXTURE_SEA_LEVEL } from './FixtureBase.mjs';
import { validateLandscapeSynthesisRecipe, LANDSCAPE_GEOLOGY_LAYERS } from '../../../../src/app/landscape/index.js';

export const SYNTHESIS_FIXTURE_FORMAT = 'landscape-synthesis-fixture-gate';
export const FIXTURE_RECIPE = 'tools/bake_landscape/terrain_synthesis/fixture/recipes/plateau-road-shoreline.json';
export const FIXTURE_BASE_FILES = Object.freeze({ heights: 'fixture-base.raw', cover: 'fixture-base-cover.u8' });
/** Declared gate targets: plan constraints of the fixture plan, relief that reads as eroded ground, no needles, geology consistency and coastal zones. */
export const FIXTURE_GATE = Object.freeze({
    plateau: { districtId: 1, bandMeters: [35, 37], flatFractionMinimum: .95 }, plaza: { districtId: 2, bandMeters: [2.3, 3.3] },
    roads: { maxSustainedGradePercent: 6, maxShortGradePercent: 8 }, shorelineToleranceMeters: 10, headlandOperatorId: 'headland',
    relief: { above10DegreesMinimumFraction: .12, above20DegreesMinimumFraction: .03, maximumSlopeMinimumDegrees: 60, incisionP90MinimumMeters: 1, relief100mP90MinimumMeters: 8 },
    // a heightfield cannot hold a one-sample spike at any spacing: a sample more than thresholdMeters above all 8 neighbours is an operator artifact
    needles: { thresholdMeters: 2, maximumCount: 0 },
    geologyInvariantToleranceMeters: 1e-3, requiredCoastalZones: Object.freeze([2, 3, 5, 6, 8, 9, 11]),
    swimZone: Object.freeze({ zMin: 300, zMax: 700, seawardMeters: 100, landwardMeters: 40, allowedLandCover: Object.freeze([0, 1]), maxSeabedSlopeDegrees: 6 }),
    viewCorridorRoadName: 'Coast road', routeRoadName: 'Plateau ascent'
});
const COASTAL_ZONE_CATALOG = Object.freeze(['inland', 'offshore', 'reef', 'bar', 'surf', 'swash', 'berm', 'backshore', 'foredune', 'platform', 'bluff toe', 'bluff face', 'bluff crown']
    .map((label, id) => ({ id, label, color: ['#d9d2c4', '#2d5f86', '#6b4e3d', '#c9a86a', '#3f93b8', '#8fd0e8', '#e8d9a8', '#cdbf8a', '#d4b36a', '#8e8a80', '#b0a48f', '#5e5348', '#9aa66e'][id] })));
const DEPOSIT_CATALOG = Object.freeze(['none', 'talus', 'colluvium', 'alluvium', 'beach sand', 'dune sand', 'reef rock'].map((label, id) => ({ id, label, color: ['#e9e4d8', '#7a6a5a', '#9c8a6e', '#c8b27a', '#e6d7a6', '#efe2b4', '#6c7a62'][id] })));
const DRAINAGE_CATALOG = Object.freeze(['hillslope', 'rill', 'gully', 'channel', 'flat/pond', 'sea'].map((label, id) => ({ id, label, color: ['#e9e4d8', '#9fc7dc', '#4f9bc4', '#1f5f9c', '#7a9c7a', '#2d5f86'][id] })));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const seconds = started => (performance.now() - started) / 1000;

/** SHA-256 of the output heights and of every layer, by name. @param {{heights:Float32Array,layers:Record<string,Float32Array|Uint8Array>}} result */
export function fixtureHashes(result) {
    const hashes = { heights: sha256(Buffer.from(result.heights.buffer, result.heights.byteOffset, result.heights.byteLength)) };
    for (const name of Object.keys(result.layers).sort()) { const array = result.layers[name]; hashes[name] = sha256(Buffer.from(array.buffer, array.byteOffset, array.byteLength)); }
    return hashes;
}

/** The read hook that serves the generated base to import-heights (raw-float32) instead of a file on disk. @param {ReturnType<typeof createFixtureBase>} base */
export function fixtureReadFile(base) {
    const files = { [FIXTURE_BASE_FILES.heights]: Buffer.from(base.heightBytes.buffer, base.heightBytes.byteOffset, base.heightBytes.byteLength), [FIXTURE_BASE_FILES.cover]: Buffer.from(base.coverBytes.buffer, base.coverBytes.byteOffset, base.coverBytes.byteLength) };
    return relative => { const bytes = files[relative]; if (!bytes) throw new Error(`[SynthesisFixture] the fixture serves only ${Object.keys(files).join(', ')}, not ${relative}`); return bytes; };
}

/** The fixture plan files bound by a recipe. @param {string} root @param {any} recipe */
export async function readFixturePlan(root, recipe) {
    const plan = {};
    for (const name of ['districts', 'roads', 'shoreline', 'beachPoints']) plan[name] = JSON.parse(await readFile(path.resolve(root, recipe.inputs.plan[name]), 'utf8'));
    return plan;
}

/**
 * The fixture grid a recipe runs on: one of the fixture spacings over the extent its bounds declare (1 km, or the 4 km city extent), with
 * the grid and hierarchy the base generator defines for it, so the base is generated at exactly the recipe grid (the D2 gate at
 * 1.953125 m; the D3 resolution study at every fixture spacing and at the city extent).
 * @param {any} recipe
 */
export function fixtureGridOf(recipe) {
    const extentMeters = recipe.grid.bounds.maxX - recipe.grid.bounds.minX, grid = fixtureGridForSpacing(recipe.grid.spacingX, { extentMeters });
    const same = recipe.grid.columns === grid.columns && recipe.grid.rows === grid.rows && recipe.grid.spacingZ === grid.spacingZ && recipe.grid.chunkIntervals === grid.chunkIntervals && recipe.grid.maxLevel === grid.maxLevel
        && ['minX', 'maxX', 'minZ', 'maxZ'].every(key => recipe.grid.bounds[key] === grid.bounds[key]);
    if (!same || recipe.working !== null) throw new Error(`[SynthesisFixture] the recipe grid must be the native fixture grid at ${grid.spacingX} m (${grid.columns} x ${grid.rows}, chunks ${grid.chunkIntervals}, maxLevel ${grid.maxLevel}, bounds 0..${grid.bounds.maxX})`);
    return grid;
}

/** The constraint-report options of the fixture plan (district 1 is the 36 m plateau town; the base cover is the planning cover). @param {ReturnType<typeof createFixtureBase>} base */
export function fixtureConstraintOptions(base) {
    return { highCityDistrictId: FIXTURE_GATE.plateau.districtId, highCityTargetMeters: 36, maxSustainedGradePercent: FIXTURE_GATE.roads.maxSustainedGradePercent, maxShortGradePercent: FIXTURE_GATE.roads.maxShortGradePercent,
        shorelineToleranceMeters: FIXTURE_GATE.shorelineToleranceMeters, viewCorridorRoadName: FIXTURE_GATE.viewCorridorRoadName, swimZone: { ...FIXTURE_GATE.swimZone }, sourceCover: base.cover };
}

/** Measurement sets of the fixture: transects across the coast, rim profiles of the plateau, two observers and the ascent as the route. @param {any} plan */
export function fixtureSets(plan) {
    const district = plan.districts.find(entry => entry.id === FIXTURE_GATE.plateau.districtId), centroid = polygonCentroid(district.boundary_xz_m);
    return {
        transects: [300, 500, 700].map(z => { const shoreX = shorelineXAt(plan.shoreline.points_xyz_m, z); return { id: `T-${z}`, z, xStart: shoreX - 150, xEnd: shoreX + 300, stepMeters: 1, shorelineX: shoreX }; }),
        profiles: [{ id: 'rim-W', dx: -1, dz: 0 }, { id: 'rim-S', dx: 0, dz: -1 }, { id: 'rim-N', dx: 0, dz: 1 }, { id: 'rim-E', dx: 1, dz: 0 }].map(direction => ({ id: direction.id, from: [centroid.x, centroid.z], to: [centroid.x + direction.dx * 250, centroid.z + direction.dz * 250], stepMeters: 2 })),
        observers: [{ id: 'plaza', x: 262, z: 500, eyeHeightMeters: 1.7, headingDegrees: 90, halfAngleDegrees: 90 }, { id: 'beach-north', x: 232, z: 650, eyeHeightMeters: 1.7, headingDegrees: 120, halfAngleDegrees: 90 }],
        targetPolygon: district.boundary_xz_m.map(point => [point[0], point[1]]), route: [{ name: FIXTURE_GATE.routeRoadName, reverse: false }]
    };
}

function check(id, passed, actual, expected) { return { id, passed: !!passed, actual, expected }; }

/**
 * @param {{root:string,recipeFile?:string,outputRoot:string,landscapeDirectory:string,signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function runSynthesisFixture({ root, recipeFile = FIXTURE_RECIPE, outputRoot, landscapeDirectory, signal, log = () => {} }) {
    const started = performance.now(), timing = {};
    const recipeBytes = await readFile(path.resolve(root, recipeFile)), recipe = validateLandscapeSynthesisRecipe(JSON.parse(recipeBytes.toString('utf8'))), plan = await readFixturePlan(root, recipe);
    const fixtureGrid = fixtureGridOf(recipe), base = createFixtureBase(fixtureGrid), readFileHook = fixtureReadFile(base);
    const operatorsDirectory = path.join(outputRoot, 'operators'), exportRoot = path.join(outputRoot, 'exports'), geologyCandidate = path.join(outputRoot, 'geology-candidate');
    // gate outputs are regenerated every run: the saved landscape and the geology candidate hold immutable content-addressed files of the previous recipe
    for (const directory of [operatorsDirectory, exportRoot, geologyCandidate, landscapeDirectory]) await rm(directory, { recursive: true, force: true });
    await mkdir(operatorsDirectory, { recursive: true }); await mkdir(exportRoot, { recursive: true });
    const baseGrid = { columns: fixtureGrid.columns, rows: fixtureGrid.rows, spacingX: fixtureGrid.spacingX, spacingZ: fixtureGrid.spacingZ, minX: fixtureGrid.bounds.minX, maxZ: fixtureGrid.bounds.maxZ };
    const thumbnails = [{ image: renderHillshade(baseGrid, base.heights, { size: 320, seaLevel: FIXTURE_SEA_LEVEL }), label: '00 base' }];
    await writeReviewPng(path.join(operatorsDirectory, '00-base.png'), thumbnails[0].image);
    let mark = performance.now();
    const run = (hooks = {}) => executeSynthesisRecipe({ recipe, inputs: { root, readFile: readFileHook, exportRoot }, memory: new TerrainFieldMemory(1024 << 20), signal, log, ...hooks });
    const first = await run({ onOperator: async ({ index, id, op, grid, layers }) => {
        const image = renderHillshade(grid, layers.get('height'), { size: 320, seaLevel: FIXTURE_SEA_LEVEL }), label = `${String(index + 1).padStart(2, '0')} ${id}`;
        thumbnails.push({ image, label });
        await writeReviewPng(path.join(operatorsDirectory, `${String(index + 1).padStart(2, '0')}-${id}.png`), image);
        log(`[SynthesisFixture] ${label} (${op}) rendered`);
    } });
    timing.firstRunSeconds = seconds(mark);
    try {
        const hashes = fixtureHashes(first);
        mark = performance.now();
        const second = await run();
        const secondHashes = fixtureHashes(second);
        second.release();
        timing.secondRunSeconds = seconds(mark);
        const identical = Object.keys(hashes).every(name => hashes[name] === secondHashes[name]) && first.report.identity === second.report.identity;
        const checks = [check('determinism', identical, { identity: first.report.identity, layers: Object.keys(hashes).length, differing: Object.keys(hashes).filter(name => hashes[name] !== secondHashes[name]) }, 'two runs produce bit-identical heights, layers and identity')];
        // measurements and the plan constraints
        mark = performance.now();
        const { grid, heights, cover, layers } = first;
        const doc = diagnoseRelief(grid, heights, cover, FIXTURE_SEA_LEVEL, plan, { label: recipe.id, log, constraints: fixtureConstraintOptions(base), sets: fixtureSets(plan), landscape: { recipe: recipeFile, identity: first.report.identity } });
        timing.diagnosisSeconds = seconds(mark);
        const districts = doc.constraints.districts.districts, plateau = districts.find(entry => entry.id === FIXTURE_GATE.plateau.districtId), plaza = districts.find(entry => entry.id === FIXTURE_GATE.plaza.districtId);
        checks.push(check('plateau-band', plateau.heights.p05 >= FIXTURE_GATE.plateau.bandMeters[0] && plateau.heights.p95 <= FIXTURE_GATE.plateau.bandMeters[1] && plateau.flatFraction >= FIXTURE_GATE.plateau.flatFractionMinimum,
            { p05: plateau.heights.p05, p95: plateau.heights.p95, flatFraction: plateau.flatFraction }, { band: FIXTURE_GATE.plateau.bandMeters, flatFractionMinimum: FIXTURE_GATE.plateau.flatFractionMinimum }));
        checks.push(check('plaza-band', plaza.heights.p05 >= FIXTURE_GATE.plaza.bandMeters[0] && plaza.heights.p95 <= FIXTURE_GATE.plaza.bandMeters[1], { p05: plaza.heights.p05, p95: plaza.heights.p95 }, { band: FIXTURE_GATE.plaza.bandMeters }));
        checks.push(check('roads', doc.constraints.roads.passed, { maxSustainedGradePercent: doc.constraints.roads.maxSustainedGradePercent, maxShortGradePercent: doc.constraints.roads.maxShortGradePercent, violations: doc.constraints.roads.roadsWithViolations }, FIXTURE_GATE.roads));
        const headland = first.report.operators.find(entry => entry.id === FIXTURE_GATE.headlandOperatorId)?.statistics.affectedShorelineVertices ?? null;
        const outside = doc.constraints.shoreline.outside, unexplained = outside.filter(entry => !headland || entry.index < headland.first || entry.index > headland.last);
        checks.push(check('shoreline', doc.constraints.shoreline.verticesOutsideTolerance === outside.length && unexplained.length === 0,
            { maxDeviationMeters: doc.constraints.shoreline.maxDeviationMeters, verticesOutsideTolerance: doc.constraints.shoreline.verticesOutsideTolerance, headlandVertices: headland, unexplained: unexplained.map(entry => entry.index) },
            `every design vertex within ${FIXTURE_GATE.shorelineToleranceMeters} m except the reported headland vertices`));
        for (const id of ['beachArrival', 'busStop', 'viewCorridor', 'swimZone', 'seaLevel', 'cover']) checks.push(check(id, doc.constraints[id].passed, { passed: doc.constraints[id].passed }, 'constraint report passes'));
        const natural = doc.slope.natural, above10 = natural.fractions.slice(3).reduce((a, b) => a + b, 0), relief100 = doc.relief.windows.find(window => window.meters === 100);
        checks.push(check('relief-slope', above10 >= FIXTURE_GATE.relief.above10DegreesMinimumFraction && natural.atLeast20Degrees.fraction >= FIXTURE_GATE.relief.above20DegreesMinimumFraction && natural.percentiles.p100 >= FIXTURE_GATE.relief.maximumSlopeMinimumDegrees,
            { above10: above10, above20: natural.atLeast20Degrees.fraction, max: natural.percentiles.p100 }, FIXTURE_GATE.relief));
        checks.push(check('relief-incision', doc.incision.incision.p90 >= FIXTURE_GATE.relief.incisionP90MinimumMeters, { p90: doc.incision.incision.p90, networks: doc.incision.networks, max: doc.incision.incision.max }, { p90Minimum: FIXTURE_GATE.relief.incisionP90MinimumMeters }));
        checks.push(check('relief-100m', relief100.natural.p90 >= FIXTURE_GATE.relief.relief100mP90MinimumMeters, { p90: relief100.natural.p90, max: relief100.natural.max }, { p90Minimum: FIXTURE_GATE.relief.relief100mP90MinimumMeters }));
        const needles = needleStatistics(grid, heights, FIXTURE_GATE.needles.thresholdMeters);
        checks.push(check('needles', needles.count <= FIXTURE_GATE.needles.maximumCount, { count: needles.count, perSquareKilometer: needles.perSquareKilometer, maxProminenceMeters: needles.maxProminenceMeters, maxAt: needles.maxAt }, FIXTURE_GATE.needles));
        // geology consistency and coastal zones
        let invariant = 0;
        for (let i = 0; i < heights.length; i++) invariant = Math.max(invariant, Math.abs(heights[i] - layers.bedrock[i] - layers.regolith[i] - layers.depositThickness[i]));
        checks.push(check('geology-invariant', invariant <= FIXTURE_GATE.geologyInvariantToleranceMeters, { maxResidualMeters: invariant }, { toleranceMeters: FIXTURE_GATE.geologyInvariantToleranceMeters }));
        const zones = new Array(13).fill(0);
        for (let i = 0; i < layers.coastalZone.length; i++) zones[layers.coastalZone[i]]++;
        checks.push(check('coastal-zones', FIXTURE_GATE.requiredCoastalZones.every(id => zones[id] > 0), { histogram: Object.fromEntries(COASTAL_ZONE_CATALOG.map(entry => [entry.label, zones[entry.id]])) }, { required: FIXTURE_GATE.requiredCoastalZones.map(id => COASTAL_ZONE_CATALOG[id].label) }));
        // interchange: the exported height map comes back bit for bit
        const exported = first.report.operators.find(entry => entry.op === 'export-map'), reimported = await importLandscapeMap(path.join(exportRoot, exported.statistics.file), { expectedGrid: grid });
        let roundTripDifferences = 0;
        for (let i = 0; i < heights.length; i++) if (!Object.is(reimported.values[i], heights[i])) roundTripDifferences++;
        checks.push(check('interchange-roundtrip', roundTripDifferences === 0 && reimported.meta.provenance.recipeIdentity === first.report.identity, { differences: roundTripDifferences, file: exported.statistics.file, sha256: exported.statistics.sha256 }, 'the exported EXR re-imports bit-exact with the recipe identity'));
        // seams: a standalone saved landscape (chunk borders verified by the preparation) and a geology sidecar candidate (page borders and halos)
        mark = performance.now();
        const written = await writeSynthesizedLandscape({ sourceDirectory: null, outputDirectory: landscapeDirectory, grid, heights, cover, id: 'synthesis-fixture', name: 'AI 596 D2 synthesis fixture', revisionLabel: recipe.id,
            provenance: { sourceName: `${recipe.id} on the analytic fixture base` }, references: 'none', appearance: 'none', fields: 'none',
            synthesis: { recipeId: recipe.id, identity: first.report.identity, recipeSha256: authoringHash(recipeBytes), sourceSpacingMeters: first.report.working.spacing },
            chunkIntervals: fixtureGrid.chunkIntervals, maxLevel: fixtureGrid.maxLevel, seaLevel: FIXTURE_SEA_LEVEL, signal, log });
        const saved = await readLandscapeFileManifest(landscapeDirectory), geologyLayers = Object.fromEntries(LANDSCAPE_GEOLOGY_LAYERS.map(name => [name, layers[name]]));
        const geology = await prepareLandscapeGeology({ directory: landscapeDirectory, outputDirectory: geologyCandidate, source: saved, layers: geologyLayers, grid, heights,
            provenance: { recipeIdentity: first.report.identity, recipeSha256: authoringHash(recipeBytes) }, verifyDeterminism: true, signal, log });
        const geologyValidation = await validateLandscapeGeologyCandidate(geology);
        timing.landscapeSeconds = seconds(mark);
        // a complete quadtree holds (4^(maxLevel + 1) - 1) / 3 nodes (5 at level 1, 21 at level 2, 85 at level 3)
        checks.push(check('seams', written.manifest.chunks.length === (4 ** (fixtureGrid.maxLevel + 1) - 1) / 3 && geologyValidation !== null, { landscape: landscapeDirectory, revision: written.revision, chunks: written.manifest.chunks.length, geologyRevision: geology.value?.revision ?? geology.revision ?? null, geologyPages: geology.value?.pages?.length ?? null }, 'native seams and geology page borders validated'));
        // review images
        mark = performance.now();
        const images = {};
        const write = async (name, image) => { const file = path.join(outputRoot, `${name}.png`); await writeReviewPng(file, image); images[name] = file; };
        await write('hillshade', renderHillshade(grid, heights, { size: 1024, seaLevel: FIXTURE_SEA_LEVEL }));
        await write('hillshade-multi', renderMultidirectionalHillshade(grid, heights, { size: 1024, seaLevel: FIXTURE_SEA_LEVEL }));
        await write('slope', renderSlopeMap(grid, heights, { size: 1024, seaLevel: FIXTURE_SEA_LEVEL }));
        await write('elevation', renderElevationMap(grid, heights, { size: 1024, seaLevel: FIXTURE_SEA_LEVEL }));
        await write('coastal-zones', renderCoverMap(grid, layers.coastalZone, { size: 1024, catalog: COASTAL_ZONE_CATALOG }));
        await write('deposits', renderCoverMap(grid, layers.depositType, { size: 1024, catalog: DEPOSIT_CATALOG }));
        await write('drainage', renderCoverMap(grid, layers.drainage, { size: 1024, catalog: DRAINAGE_CATALOG }));
        await write('operators', composeSheet(thumbnails, { columns: 6 }));
        await write('profiles-beach', renderProfilePlot({ title: 'Fixture beach transects (0 = design shoreline, +X landward)', verticalExaggeration: 8, seaLevel: FIXTURE_SEA_LEVEL, xLabel: 'distance from design shoreline (m)', yLabel: 'height (m)',
            series: doc.beach.transects.map(t => { const shoreX = shorelineXAt(plan.shoreline.points_xyz_m, t.z); return { label: t.id, distance: t.stations.x.map(x => x - shoreX), height: t.stations.height }; }) }));
        await write('profile-ascent', renderProfilePlot({ title: 'Plateau ascent centerline', verticalExaggeration: 6, seaLevel: FIXTURE_SEA_LEVEL, xLabel: 'distance along the ascent (m)', yLabel: 'height (m)', series: [{ label: 'centerline height', distance: doc.route.stations.distance, height: doc.route.stations.height }] }));
        timing.renderSeconds = seconds(mark);
        await writeFile(path.join(outputRoot, 'diagnosis.json'), JSON.stringify(doc, null, 1));
        await writeFile(path.join(outputRoot, 'diagnosis.md'), reliefDiagnosisMarkdown(doc));
        await writeFile(path.join(outputRoot, 'engine-report.json'), JSON.stringify(first.report, null, 1));
        const passed = checks.every(entry => entry.passed);
        const receipt = { format: SYNTHESIS_FIXTURE_FORMAT, schemaVersion: 1, passed, recipe: recipeFile, recipeSha256: authoringHash(recipeBytes), identity: first.report.identity, hashes, checks, gate: FIXTURE_GATE,
            engine: { operators: first.report.operators.map(({ id, op, seconds }) => ({ id, op, seconds })), totalSeconds: first.report.totalSeconds, peakTrackedBytes: first.report.memory?.peakTrackedBytes ?? null },
            landscape: { directory: landscapeDirectory, revision: written.revision, geologyCandidate }, images, timing: { ...timing, totalSeconds: seconds(started) } };
        await writeFile(path.join(outputRoot, 'fixture-gate.json'), JSON.stringify(receipt, null, 1));
        await writeFile(path.join(outputRoot, 'fixture-gate.md'), fixtureGateMarkdown(receipt));
        return receipt;
    } finally { first.release(); }
}

/** @param {any} receipt */
export function fixtureGateMarkdown(receipt) {
    const lines = [`# D2 synthesis fixture gate: ${receipt.passed ? 'PASS' : 'FAIL'}`, '', `Recipe ${receipt.recipe} (identity ${receipt.identity}); engine ${receipt.engine.totalSeconds.toFixed(1)} s; total ${receipt.timing.totalSeconds.toFixed(1)} s.`, '',
        '| check | result | actual | expected |', '| --- | --- | --- | --- |'];
    for (const entry of receipt.checks) lines.push(`| ${entry.id} | ${entry.passed ? 'pass' : 'FAIL'} | ${JSON.stringify(entry.actual)} | ${JSON.stringify(entry.expected)} |`);
    lines.push('', '| operator | seconds |', '| --- | ---: |');
    for (const entry of receipt.engine.operators) lines.push(`| ${entry.id} (${entry.op}) | ${entry.seconds.toFixed(2)} |`);
    return lines.join('\n') + '\n';
}
