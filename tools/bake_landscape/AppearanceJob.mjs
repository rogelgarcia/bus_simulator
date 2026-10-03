// Registers offline PBR appearance preparation with the shared configuration, validation and publication gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../baking/Files.mjs';
import { publishBakeFile } from '../baking/Publication.mjs';
import { readLandscapeFileManifest } from '../landscape_authoring/LandscapeFileIO.mjs';
import { acquireAuthoringLock } from '../landscape_authoring/AuthoringFiles.mjs';
import { inspectAppearanceSources, prepareLandscapeAppearance, validateAppearanceCandidate, publishLandscapeAppearance } from './AppearancePreparation.mjs';
import { appearanceCompatibilityOption, readAppearanceCompatibilitySnapshot } from './AppearanceCompatibility.mjs';

const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Appearance source/directory must be an existing path'); return value; };
export const appearanceJob = {
    id: 'landscape/appearance', configurationPaths: ['pythonExecutable'], codePaths: ['tools/bake_landscape'],
    description: 'Prepare independent authenticated PBR texture tiers from existing public catalog imagery without loading terrain heights',
    outputs: ['tests/artifacts/screens/landscape/ai576/d4/appearance-validation.json'],
    defaults: { directory: 'assets/public/landscape/coastal-city', 'source-root': 'assets/public/pbr' },
    options: { directory: pathOption, 'source-root': pathOption, 'compatibility-snapshot': appearanceCompatibilityOption },
    async inputs(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), sourceRoot = path.resolve(ctx.root, ctx.options['source-root']);
        const { manifest } = await readLandscapeFileManifest(directory), source = await inspectAppearanceSources(sourceRoot, manifest);
        const files = [path.join(directory, 'manifest.json'), ...source.sources.map(file => path.join(sourceRoot, file))];
        if (ctx.options['compatibility-snapshot']) files.push(...(await readAppearanceCompatibilitySnapshot(directory, ctx.options['compatibility-snapshot'])).files);
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring']) files.push(...(await listFiles(path.join(ctx.root, folder))).filter(file => /\.(m?js)$/.test(file)));
        return files;
    },
    async run(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), sourceRoot = path.resolve(ctx.root, ctx.options['source-root']);
        const release = await acquireAuthoringLock(directory);
        try {
            const prepared = await prepareLandscapeAppearance(ctx, { directory, sourceRoot });
            await validateAppearanceCandidate(prepared); await ctx.assertInputsStable();
            const reportFile = path.join(ctx.stage, 'validation.json'); await writeJson(reportFile, prepared.report);
            const inputManifestFile = path.join(ctx.stage, 'terrain-manifest.json'); await writeJson(inputManifestFile, JSON.parse(prepared.inputManifestBytes.toString('utf8')));
            const files = [...await listFiles(prepared.outputDirectory), ...await listFiles(prepared.metadataDirectory), reportFile, inputManifestFile];
            if (ctx.publish) files.push(...await publishLandscapeAppearance(prepared, path.join(ctx.root, 'assets/public/pbr'), { compatibilitySnapshot: ctx.options['compatibility-snapshot'] }));
            const evidence = path.join(ctx.root, 'tests/artifacts/screens/landscape/ai576/d4/appearance-validation.json');
            await publishBakeFile(reportFile, evidence); files.push(evidence);
            ctx.log.line(ctx.id, `${prepared.report.pages} bounded pages, ${prepared.report.materials} soil materials; no terrain payloads read`);
            return { state: ctx.publish ? 'published' : 'validated', directory, outputDirectory: prepared.outputDirectory, metadataDirectory: prepared.metadataDirectory,
                metadata: prepared.metadata, manifestFile: prepared.manifestFile, inputManifestFile, reportFile, files };
        } finally { await release(); }
    },
    async validate(result) {
        await validateAppearanceCandidate({ ...result, report: JSON.parse(await readFile(result.reportFile, 'utf8')), inputManifestBytes: await readFile(result.inputManifestFile) });
    }
};
