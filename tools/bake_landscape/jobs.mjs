// Registers the explicit CPU-only coastal import without adding it to production lighting/material defaults.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../baking/Files.mjs';
import { publishBakeFile } from '../baking/Publication.mjs';
import { readCoastalArchive } from './CoastalArchive.mjs';
import { prepareCoastalLandscape } from './CoastalPreparation.mjs';
import { validatePreparedCoastal } from './CoastalValidation.mjs';
import { publishPreparedCoastal } from './CoastalPublication.mjs';
import { hierarchyJob } from './HierarchyJob.mjs';

const DESTINATION = 'assets/public/landscape/coastal-city';

function sourceOption(value) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Coastal source must be an existing ZIP path');
    return value;
}

export const coastalImportJob = {
    id: 'landscape/coastal-import', configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'Authenticate coastal v2 source, partition native channels, validate and optionally publish a bounded overview',
    outputs: [DESTINATION], options: { source: sourceOption },
    async inputs(ctx) {
        if (!ctx.options.source) throw new Error('Coastal import requires --set landscape/coastal-import:source=<source.zip>');
        return [path.resolve(ctx.root, ctx.options.source), ...(await listFiles(path.join(ctx.root, 'src/app/landscape'))).filter(file => file.endsWith('.js'))];
    },
    async run(ctx) {
        const archive = await readCoastalArchive(path.resolve(ctx.root, ctx.options.source));
        ctx.log.line(ctx.id, `Authenticated source ${archive.sourceSha256}; preparing native 8x8 chunks and one 257x257 overview`);
        const prepared = await prepareCoastalLandscape(path.join(ctx.stage, 'coastal-city'), archive);
        const validation = await validatePreparedCoastal(prepared.directory);
        const report = path.join(ctx.stage, 'validation.json');
        await writeJson(report, { ...validation, sourceSummary: prepared.sourceSummary });
        await ctx.assertInputsStable();
        const result = { state: 'validated', directory: prepared.directory, manifestFile: prepared.manifestFile, report, files: [...prepared.files, report] };
        if (ctx.publish) {
            const installed = await publishPreparedCoastal(prepared, path.join(ctx.root, DESTINATION), { signal: ctx.signal });
            result.files.push(...installed); result.state = 'published';
        }
        const evidence = path.join(ctx.root, 'tests/artifacts/screens/landscape/ai576/d1/import-validation.json');
        await publishBakeFile(report, evidence); result.files.push(evidence);
        ctx.log.line(ctx.id, `${validation.nativeChunks} native chunks; ${validation.sharedBorders} exact shared borders; overview ${validation.overview.payloadBytes} bytes; maximum provisional error ${validation.overview.maximumMeters.toFixed(6)}m`);
        return result;
    },
    async validate(result) {
        const validation = await validatePreparedCoastal(result.directory);
        const report = JSON.parse(await readFile(result.report, 'utf8'));
        if (!report.passed || report.manifestSha256 !== validation.manifestSha256 || report.sourceSha256 !== validation.sourceSha256) throw new Error('Coastal import validation receipt mismatch');
    }
};

export const landscapeJobs = Object.freeze([coastalImportJob, hierarchyJob, {
    id: 'landscape', configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'Explicit authored landscape preparation; no Blender, browser, or unrelated production bakes',
    children: ['landscape/coastal-import']
}]);
