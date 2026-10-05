// Registers the global terrain-field bake with the shared configuration, framework input stability and manifest-last publication gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../../baking/Files.mjs';
import { publishBakeFile } from '../../baking/Publication.mjs';
import { readLandscapeFileManifest } from '../../landscape_authoring/LandscapeFileIO.mjs';
import { acquireAuthoringLock, authoringFile, readAuthoringFile, writeImmutableAuthoringFile } from '../../landscape_authoring/AuthoringFiles.mjs';
import { prepareTerrainFields, publishTerrainFields, validateTerrainFieldsCandidate } from './TerrainFieldsPreparation.mjs';
import { readTerrainFieldImports } from './TerrainFieldsImports.mjs';

const RECEIPT = 'tests/artifacts/screens/landscape/ai577/d5/terrain-fields-validation.json';
const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Terrain field paths must name existing files or directories'); return value; };
const booleanOption = value => { if (!['true', 'false'].includes(String(value))) throw new Error('verify-determinism must be true or false'); return String(value) === 'true'; };

export const terrainFieldsJob = {
    id: 'landscape/terrain-fields', configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'Analyze the CURRENT native terrain globally (depressions, flow, wetness, deposition, rock, horizons, sky view, shore distance, natural soil) into validated mask-aligned field pages',
    outputs: [RECEIPT],
    defaults: { directory: 'assets/public/landscape/coastal-city', recipe: 'tools/bake_landscape/terrain_fields/recipe-v1.json', 'verify-determinism': true },
    options: { directory: pathOption, recipe: pathOption, imports: pathOption, 'verify-determinism': booleanOption },
    async inputs(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), saved = await readLandscapeFileManifest(directory);
        const inputFile = path.join(ctx.stage, 'planned-terrain-manifest.json'); await writeImmutableAuthoringFile(inputFile, saved.bytes);
        const files = new Set([inputFile, path.resolve(ctx.root, ctx.options.recipe)]);
        for (const chunk of saved.manifest.chunks.filter(entry => entry.level === saved.manifest.grid.maxLevel)) for (const channel of Object.values(chunk.channels)) files.add(authoringFile(directory, channel.url));
        if (ctx.options.imports) for (const file of (await readTerrainFieldImports(path.resolve(ctx.root, ctx.options.imports), saved.manifest)).files) files.add(file);
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring']) for (const file of await listFiles(path.join(ctx.root, folder))) if (/\.(m?js)$/.test(file)) files.add(file);
        return [...files];
    },
    async run(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), release = await acquireAuthoringLock(directory);
        try {
            const source = await readLandscapeFileManifest(ctx.stage, 'planned-terrain-manifest.json');
            if (!(await readAuthoringFile(path.join(directory, 'manifest.json'), 1024 * 1024)).equals(source.bytes)) throw new Error('Current landscape changed after terrain-field planning; retry');
            const prepared = await prepareTerrainFields({ directory, outputDirectory: path.join(ctx.stage, 'fields'), source, recipeFile: path.resolve(ctx.root, ctx.options.recipe),
                importsFile: ctx.options.imports ? path.resolve(ctx.root, ctx.options.imports) : undefined, verifyDeterminism: ctx.options['verify-determinism'], signal: ctx.signal,
                log: message => ctx.log.line(ctx.id, message) });
            const validation = await validateTerrainFieldsCandidate(prepared);
            await ctx.assertInputsStable();
            const reportFile = path.join(ctx.stage, 'validation.json'); await writeJson(reportFile, { ...prepared.report, checks: validation.checks, statistics: prepared.value.statistics });
            const files = [prepared.sidecarFile, ...validation.files.map(relative => path.join(prepared.outputDirectory, relative)), reportFile];
            if (ctx.publish) files.push(...await publishTerrainFields(prepared));
            const evidence = path.join(ctx.root, RECEIPT); await publishBakeFile(reportFile, evidence); files.push(evidence);
            ctx.log.line(ctx.id, `${prepared.value.revision}: ${prepared.report.pages.count} pages (${prepared.report.pages.uniqueFieldPages} unique field pages, ${prepared.report.pages.naturalSoilPages} natural soil pages); `
                + `global stage ${prepared.report.timing.globalSeconds.toFixed(1)} s; tracked peak ${(prepared.report.memory.peakTrackedBytes / 2 ** 20).toFixed(1)} MiB; determinism ${prepared.report.determinism.verified ? 'verified' : 'not repeated'}`);
            return { state: ctx.publish ? 'published' : 'validated', directory, outputDirectory: prepared.outputDirectory, sidecarFile: prepared.sidecarFile, reportFile,
                inputManifestFile: path.join(ctx.stage, 'planned-terrain-manifest.json'), files };
        } finally { await release(); }
    },
    async validate(result) {
        const report = JSON.parse(await readFile(result.reportFile, 'utf8')), source = await readLandscapeFileManifest(path.dirname(result.inputManifestFile), path.basename(result.inputManifestFile));
        await validateTerrainFieldsCandidate({ directory: result.directory, outputDirectory: result.outputDirectory, sidecarFile: result.sidecarFile, manifest: source.manifest, sourceBytes: source.bytes, report });
    }
};
