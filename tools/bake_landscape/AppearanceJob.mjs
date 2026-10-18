// Registers offline PBR appearance preparation with the shared configuration, validation and publication gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../baking/Files.mjs';
import { publishBakeFile } from '../baking/Publication.mjs';
import { readLandscapeFileManifest } from '../landscape_authoring/LandscapeFileIO.mjs';
import { acquireAuthoringLock, readAuthoringFile, writeImmutableAuthoringFile } from '../landscape_authoring/AuthoringFiles.mjs';
import { inspectAppearanceSources, prepareLandscapeAppearance, validateAppearanceCandidate, publishLandscapeAppearance } from './AppearancePreparation.mjs';
import { appearanceCompatibilityOption, readAppearanceCompatibilitySnapshot } from './AppearanceCompatibility.mjs';
import { prepareAppearanceMaterialBindings } from './AppearanceMaterialBindings.mjs';
import { readAppearanceMultiscaleRequest, inspectAppearanceMultiscaleSources } from './AppearanceMultiscale.mjs';
import { readAppearanceLayersRequest, inspectAppearanceLayersSources } from './AppearanceLayers.mjs';
import { LANDSCAPE_DEFAULT_DIRECTORY } from '../../src/app/landscape/LandscapeCache.js';
import { LANDSCAPE_SURFACE_RECIPE } from '../../src/app/landscape/index.js';

const MULTISCALE_RECEIPT = 'tests/artifacts/screens/landscape/ai577/d4/appearance-multiscale-validation.json';
const LAYERS_RECEIPT = 'tests/artifacts/screens/landscape/ai598/d2/appearance-layers-validation.json';
const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Appearance source/directory must be an existing path'); return value; };
export const appearanceJob = {
    id: 'landscape/appearance', configurationPaths: ['pythonExecutable'], codePaths: ['tools/bake_landscape'],
    description: 'Prepare independent authenticated PBR texture tiers from existing public catalog imagery without loading terrain heights',
    outputs: ['tests/artifacts/screens/landscape/ai576/d4/appearance-validation.json', MULTISCALE_RECEIPT, LAYERS_RECEIPT],
    defaults: { directory: LANDSCAPE_DEFAULT_DIRECTORY, 'source-root': 'assets/public/pbr' },
    options: { directory: pathOption, 'source-root': pathOption, 'compatibility-snapshot': appearanceCompatibilityOption, 'material-bindings': pathOption, multiscale: pathOption, layers: pathOption },
    async inputs(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), sourceRoot = path.resolve(ctx.root, ctx.options['source-root']);
        const materialBindings = ctx.options['material-bindings'] ? path.resolve(ctx.root, ctx.options['material-bindings']) : undefined;
        const multiscale = ctx.options.multiscale ? path.resolve(ctx.root, ctx.options.multiscale) : undefined;
        const layers = ctx.options.layers ? path.resolve(ctx.root, ctx.options.layers) : undefined;
        const saved = await readLandscapeFileManifest(directory), manifest = await prepareAppearanceMaterialBindings(saved.manifest, materialBindings);
        const source = await inspectAppearanceSources(sourceRoot, manifest);
        const inputFile = path.join(ctx.stage, 'planned-terrain-manifest.json'); await writeImmutableAuthoringFile(inputFile, saved.bytes);
        const files = [inputFile, ...source.sources.map(file => path.join(sourceRoot, file))];
        if (materialBindings) files.push(materialBindings);
        if (multiscale) {
            const request = await readAppearanceMultiscaleRequest(multiscale, manifest);
            files.push(multiscale, ...(await inspectAppearanceMultiscaleSources(sourceRoot, request.request)).sources.map(file => path.join(sourceRoot, file)));
        }
        if (layers) {
            const request = await readAppearanceLayersRequest(layers, manifest, LANDSCAPE_SURFACE_RECIPE);
            files.push(layers, ...(await inspectAppearanceLayersSources(sourceRoot, request.request)).sources.map(file => path.join(sourceRoot, file)));
        }
        if (ctx.options['compatibility-snapshot']) files.push(...(await readAppearanceCompatibilitySnapshot(directory, ctx.options['compatibility-snapshot'])).files);
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring']) files.push(...(await listFiles(path.join(ctx.root, folder))).filter(file => /\.(m?js)$/.test(file)));
        return [...new Set(files)];
    },
    async run(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), sourceRoot = path.resolve(ctx.root, ctx.options['source-root']);
        const release = await acquireAuthoringLock(directory);
        try {
            const source = await readLandscapeFileManifest(ctx.stage, 'planned-terrain-manifest.json');
            if (!(await readAuthoringFile(path.join(directory, 'manifest.json'), 1024 * 1024)).equals(source.bytes)) throw new Error('Current landscape changed after appearance planning; retry');
            const materialBindings = ctx.options['material-bindings'] ? path.resolve(ctx.root, ctx.options['material-bindings']) : undefined;
            const multiscale = ctx.options.multiscale ? path.resolve(ctx.root, ctx.options.multiscale) : undefined;
            const layers = ctx.options.layers ? path.resolve(ctx.root, ctx.options.layers) : undefined;
            const prepared = await prepareLandscapeAppearance(ctx, { directory, sourceRoot, materialBindings, multiscale, layers, source });
            await validateAppearanceCandidate(prepared); await ctx.assertInputsStable();
            const reportFile = path.join(ctx.stage, 'validation.json'); await writeJson(reportFile, prepared.report);
            const inputManifestFile = path.join(ctx.stage, 'terrain-manifest.json'); await writeJson(inputManifestFile, JSON.parse(prepared.inputManifestBytes.toString('utf8')));
            const sourceManifestFile = path.join(ctx.stage, 'source-terrain-manifest.json'); await writeImmutableAuthoringFile(sourceManifestFile, prepared.sourceManifestBytes);
            const files = [...await listFiles(prepared.outputDirectory), ...await listFiles(prepared.metadataDirectory), reportFile, inputManifestFile, sourceManifestFile];
            if (ctx.publish) files.push(...await publishLandscapeAppearance(prepared, path.join(ctx.root, 'assets/public/pbr'), { compatibilitySnapshot: ctx.options['compatibility-snapshot'] }));
            const evidence = path.join(ctx.root, 'tests/artifacts/screens/landscape/ai576/d4/appearance-validation.json');
            await publishBakeFile(reportFile, evidence); files.push(evidence);
            if (prepared.multiscale) { const receipt = path.join(ctx.root, MULTISCALE_RECEIPT); await publishBakeFile(reportFile, receipt); files.push(receipt); }
            if (prepared.layers) { const receipt = path.join(ctx.root, LAYERS_RECEIPT); await publishBakeFile(reportFile, receipt); files.push(receipt); }
            const extra = prepared.report.multiscale ? `; multiscale ${prepared.report.multiscale.revision} with ${prepared.report.multiscale.uniquePages} unique companion pages` : '';
            const layered = prepared.report.layers ? `; layers ${prepared.report.layers.revision} with ${prepared.report.layers.materials.length} class materials in ${prepared.report.layers.uniquePages} unique pages` : '';
            ctx.log.line(ctx.id, `${prepared.report.pages} bounded pages, ${prepared.report.materials} soil materials${extra}${layered}; no terrain payloads read`);
            return { state: ctx.publish ? 'published' : 'validated', directory, outputDirectory: prepared.outputDirectory, metadataDirectory: prepared.metadataDirectory,
                metadata: prepared.metadata, manifestFile: prepared.manifestFile, inputManifestFile, sourceManifestFile, reportFile, files,
                ...(prepared.multiscale ? { multiscale: prepared.multiscale } : {}), ...(prepared.layers ? { layers: prepared.layers } : {}) };
        } finally { await release(); }
    },
    async validate(result) {
        await validateAppearanceCandidate({ ...result, report: JSON.parse(await readFile(result.reportFile, 'utf8')), inputManifestBytes: await readFile(result.inputManifestFile),
            sourceManifestBytes: result.sourceManifestFile ? await readFile(result.sourceManifestFile) : undefined });
    }
};
