// Registers the ecosystem tiles leaf: generates every offline layer of a recipe over the current saved landscape, gates determinism, seams and spacing, and publishes the additive sidecar.
// @ts-check
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { listFiles, writeJson } from '../../baking/Files.mjs';
import { publishBakeFile } from '../../baking/Publication.mjs';
import { readLandscapeFileManifest } from '../../landscape_authoring/LandscapeFileIO.mjs';
import { acquireAuthoringLock, authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from '../../landscape_authoring/AuthoringFiles.mjs';
import { ecosystemRecipeIdentity, validateEcosystemRecipe } from '../../../src/app/landscape/ecosystem/EcosystemRecipe.js';
import { ecosystemOverridesIdentity, validateEcosystemOverrides } from '../../../src/app/landscape/ecosystem/EcosystemOverrides.js';
import { ECOSYSTEM_BLUE_NOISE } from '../../../src/app/landscape/ecosystem/EcosystemBlueNoise.js';
import { ecosystemPlanningFiles } from './EcosystemFileSources.mjs';
import { runEcosystemGeneration } from './EcosystemBake.mjs';
import { publishEcosystemSidecar, stageEcosystemSidecar, validateEcosystemCandidate } from './EcosystemPublication.mjs';

export const ECOSYSTEM_RECEIPT = 'tests/artifacts/screens/landscape/ai599/d2/ecosystem-bake.json';
export const ECOSYSTEM_DIRECTORY_DEFAULT = 'assets/public/landscape/coastal-city-v3';
export const ECOSYSTEM_RECIPE_DEFAULT = 'tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json';
const MANIFEST_LIMIT = 1024 * 1024;
const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Ecosystem paths must name existing files or directories'); return value; };
const densityOption = value => { const scale = Number(value); if (!Number.isFinite(scale) || scale < 0 || scale > 16) throw new Error('density must be a number in 0..16'); return scale; };
const layersOption = value => { const ids = String(value).split(',').map(id => id.trim()).filter(Boolean); if (!ids.length || ids.some(id => !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id))) throw new Error('layers must be a comma-separated list of layer ids'); return ids; };
const exists = file => stat(file).then(info => info.isFile(), () => false);

export const ecosystemJob = {
    id: 'landscape/ecosystem', configurationPaths: [], codePaths: ['tools/bake_landscape'], dependencies: ['landscape/ecosystem/blue-noise'],
    description: 'Generate the offline ecosystem layers of a recipe over the CURRENT saved landscape (blue-noise lattice; rules over terrain, fields, geology and planning; competition; children), gate determinism, seams and spacing, and publish the additive ecosystem/manifest.json',
    outputs: [ECOSYSTEM_RECEIPT],
    defaults: { directory: ECOSYSTEM_DIRECTORY_DEFAULT, recipe: ECOSYSTEM_RECIPE_DEFAULT, density: 1, receipt: ECOSYSTEM_RECEIPT },
    options: { directory: pathOption, recipe: pathOption, overrides: pathOption, density: densityOption, layers: layersOption, receipt: pathOption },
    async inputs(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), saved = await readLandscapeFileManifest(directory);
        const inputFile = path.join(ctx.stage, 'planned-terrain-manifest.json'); await writeImmutableAuthoringFile(inputFile, saved.bytes);
        const files = new Set([inputFile, path.resolve(ctx.root, ctx.options.recipe), path.join(ctx.root, 'src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js')]);
        if (ctx.options.overrides) files.add(path.resolve(ctx.root, ctx.options.overrides));
        for (const chunk of saved.manifest.chunks.filter(entry => entry.level === saved.manifest.grid.maxLevel)) for (const channel of Object.values(chunk.channels)) files.add(authoringFile(directory, channel.url));
        for (const relative of ['fields/manifest.json', 'geology/manifest.json']) { const file = path.join(directory, relative); if (await exists(file)) files.add(file); }
        for (const file of ecosystemPlanningFiles(directory, saved.manifest)) files.add(file);
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring']) for (const file of await listFiles(path.join(ctx.root, folder))) if (/\.(m?js)$/.test(file)) files.add(file);
        return [...files];
    },
    async run(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), release = await acquireAuthoringLock(directory), log = message => ctx.log.line(ctx.id, message);
        try {
            const source = await readLandscapeFileManifest(ctx.stage, 'planned-terrain-manifest.json');
            if (!(await readAuthoringFile(path.join(directory, 'manifest.json'), MANIFEST_LIMIT)).equals(source.bytes)) throw new Error('Current landscape changed after ecosystem planning; retry');
            const recipeFile = path.resolve(ctx.root, ctx.options.recipe), recipeBytes = await readAuthoringFile(recipeFile, MANIFEST_LIMIT), recipe = validateEcosystemRecipe(JSON.parse(recipeBytes.toString('utf8')));
            let overrides = null, overridesReport = null;
            if (ctx.options.overrides) {
                const file = path.resolve(ctx.root, ctx.options.overrides), bytes = await readAuthoringFile(file, MANIFEST_LIMIT);
                overrides = validateEcosystemOverrides(JSON.parse(bytes.toString('utf8')), recipe);
                overridesReport = { id: overrides.id, identity: await ecosystemOverridesIdentity(overrides), sha256: authoringHash(bytes), file: path.relative(ctx.root, file) };
            }
            const offline = Object.values(recipe.layers).filter(layer => layer.generation === 'offline').map(layer => layer.id), layerIds = ctx.options.layers ?? offline;
            for (const id of layerIds) if (!offline.includes(id)) throw new Error(`[Ecosystem] layer ${id} is not an offline layer of ${recipe.id} (offline: ${offline.join(', ')})`);
            const densityScale = ctx.options.density;
            log(`[Ecosystem] ${recipe.id} (${await ecosystemRecipeIdentity(recipe)}) on ${directory}: layers ${layerIds.join(', ')}; density scale ${densityScale}; blue noise ${ECOSYSTEM_BLUE_NOISE.id}`);
            const run = await runEcosystemGeneration({ directory, source, recipe, overrides, densityScale, layerIds, signal: ctx.signal, log });
            // timings stay in the receipt: the sidecar bytes (and so its revision) must depend on the inputs alone
            const prepared = await stageEcosystemSidecar({ landscape: run.landscape, recipe, recipeSha256: authoringHash(recipeBytes), overrides, densityScale, layers: run.layers,
                statistics: { layers: run.statistics, coverage: run.coverage, gates: run.gates }, outputDirectory: path.join(ctx.stage, 'ecosystem'), signal: ctx.signal });
            const validation = await validateEcosystemCandidate(prepared);
            await ctx.assertInputsStable();
            const receipt = { format: 'landscape-ecosystem-bake-receipt', schemaVersion: 1, passed: run.gates.passed, landscape: { id: source.manifest.id, revision: source.manifest.revision, directory: path.relative(ctx.root, directory), manifestSha256: authoringHash(source.bytes) },
                recipe: { id: recipe.id, identity: await ecosystemRecipeIdentity(recipe), sha256: authoringHash(recipeBytes), file: path.relative(ctx.root, recipeFile) }, overrides: overridesReport, densityScale, layerIds, blueNoise: ECOSYSTEM_BLUE_NOISE.id,
                sources: { fields: run.landscape.fields?.revision ?? null, geology: run.landscape.geology?.revision ?? null, planningFeatures: run.landscape.planning.features.length, reads: run.reads },
                layers: Object.fromEntries(run.order.map(id => [id, { ...run.statistics[id], ...run.densities[id], seconds: run.timing[id] }])), coverage: run.coverage, gates: run.gates, timing: run.timing,
                sidecar: { ...prepared.report, checks: validation.checks }, memory: { processMaxRssBytes: process.resourceUsage().maxRSS * 1024, note: 'process RSS includes the Node runtime and is not a bound' }, publication: null };
            if (!run.gates.passed) throw new Error(`[Ecosystem] generation gates failed: ${JSON.stringify({ determinism: run.gates.determinism, seams: run.gates.seams, spacing: run.gates.spacing })}`);
            const files = [prepared.manifestFile, ...validation.files.map(relative => path.join(prepared.outputDirectory, relative))];
            if (ctx.publish) {
                const installed = await publishEcosystemSidecar(prepared);
                receipt.publication = { published: true, manifest: path.relative(ctx.root, installed.at(-1)), revision: prepared.value.revision, files: installed.length };
                files.push(...installed);
            }
            const reportFile = path.join(ctx.stage, 'ecosystem-bake.json'); await writeJson(reportFile, receipt);
            const evidence = path.resolve(ctx.root, ctx.options.receipt); await publishBakeFile(reportFile, evidence); files.push(reportFile, evidence);
            log(`${prepared.value.revision}: ${run.order.map(id => `${id} ${run.statistics[id].instances} instances in ${run.statistics[id].tiles} tiles`).join('; ')}; generation ${run.timing.generationSeconds} s, gates ${run.timing.gateSeconds} s; sidecar ${prepared.report.totalBytes} bytes${ctx.publish ? '; published' : ''}`);
            return { state: ctx.publish ? 'published' : 'validated', directory, outputDirectory: prepared.outputDirectory, manifestFile: prepared.manifestFile, sidecarSha256: prepared.report.sidecarSha256, reportFile, inputManifestFile: path.join(ctx.stage, 'planned-terrain-manifest.json'), files };
        } finally { await release(); }
    },
    async validate(result) {
        const source = await readLandscapeFileManifest(path.dirname(result.inputManifestFile), path.basename(result.inputManifestFile)), receipt = JSON.parse(await readFile(result.reportFile, 'utf8'));
        if (receipt.format !== 'landscape-ecosystem-bake-receipt' || receipt.passed !== true) throw new Error('Ecosystem receipt does not record passing gates');
        await validateEcosystemCandidate({ directory: result.directory, outputDirectory: result.outputDirectory, manifestFile: result.manifestFile, manifest: source.manifest, sourceBytes: source.bytes, report: { sidecarSha256: result.sidecarSha256 } });
    }
};
