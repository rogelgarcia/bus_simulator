// Registers current-source hierarchy maintenance with the existing bake and authoring publication gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../baking/Files.mjs';
import { publishBakeFile } from '../baking/Publication.mjs';
import { readLandscapeFileManifest } from '../landscape_authoring/LandscapeFileIO.mjs';
import { acquireAuthoringLock, authoringFile, readAuthoringFile, writeImmutableAuthoringFile } from '../landscape_authoring/AuthoringFiles.mjs';
import { prepareLandscapeHierarchy } from './HierarchyPreparation.mjs';
import { publishLandscapeHierarchy, validateHierarchyCandidate } from './HierarchyPublication.mjs';

export const hierarchyJob = {
    id: 'landscape/hierarchy', always: true, configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'Prepare and validate a complete measured hierarchy from CURRENT saved native chunks; optionally publish without resetting authored terrain',
    outputs: ['tests/artifacts/screens/landscape/ai576/d3/hierarchy-validation.json'],
    defaults: { directory: 'assets/public/landscape/coastal-city' },
    options: { directory: value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Hierarchy directory must be an existing landscape path'); return value; } },
    async inputs(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), current = await readLandscapeFileManifest(directory);
        const inputFile = path.join(ctx.stage, 'input-manifest.json'); await writeImmutableAuthoringFile(inputFile, current.bytes);
        const inputs = new Set([inputFile]);
        const manifests = [current.manifest];
        if (current.manifest.editHistory?.previousManifestUrl) {
            const previous = current.manifest.editHistory.previousManifestUrl;
            inputs.add(authoringFile(directory, previous)); manifests.push((await readLandscapeFileManifest(directory, previous)).manifest);
        }
        for (const manifest of manifests) for (const chunk of manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel)) {
            for (const channel of Object.values(chunk.channels)) inputs.add(authoringFile(directory, channel.url));
        }
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring']) for (const file of await listFiles(path.join(ctx.root, folder))) {
            if (/\.(m?js)$/.test(file)) inputs.add(file);
        }
        return [...inputs];
    },
    async run(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), release = await acquireAuthoringLock(directory);
        try {
            const source = await readLandscapeFileManifest(ctx.stage, 'input-manifest.json');
            if (!(await readAuthoringFile(path.join(directory, 'manifest.json'), 1024 * 1024)).equals(source.bytes)) throw new Error('Current landscape changed after hierarchy planning; retry');
            const prepared = await prepareLandscapeHierarchy({ directory, outputDirectory: path.join(ctx.stage, 'prepared'), source, signal: ctx.signal });
            await validateHierarchyCandidate(prepared);
            const reportFile = path.join(ctx.stage, 'validation.json'); await writeJson(reportFile, prepared.report);
            await ctx.assertInputsStable();
            const files = [...prepared.files, reportFile];
            if (ctx.publish) files.push(...await publishLandscapeHierarchy(prepared));
            const evidence = path.join(ctx.root, 'tests/artifacts/screens/landscape/ai576/d3/hierarchy-validation.json');
            await publishBakeFile(reportFile, evidence); files.push(evidence);
            ctx.log.line(ctx.id, `${prepared.manifest.chunks.length} nodes; ${prepared.report.builds[0].errorSamples} exact native/error comparisons; at most one native chunk resident; ${prepared.report.changed ? 'new metadata revision' : 'unchanged revision'}`);
            return { state: ctx.publish ? 'published' : 'validated', directory, manifestFile: prepared.manifestFile, inputManifestFile: path.join(ctx.stage, 'input-manifest.json'),
                outputDirectory: prepared.outputDirectory, reportFile, files };
        } finally { await release(); }
    },
    async validate(result) {
        await validateHierarchyCandidate({ ...result, report: JSON.parse(await readFile(result.reportFile, 'utf8')),
            inputManifestBytes: await readFile(result.inputManifestFile) });
    }
};
