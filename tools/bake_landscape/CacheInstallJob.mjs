// Registers installation of a verified local landscape cache bundle (a downloaded or exported landscape directory) with the shared bake gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../baking/Files.mjs';
import { publishBakeFile } from '../baking/Publication.mjs';
import { installLandscapeCacheBundle, verifyLandscapeCacheBundle } from './CacheBundle.mjs';
import { LANDSCAPE_DEFAULT_DIRECTORY } from '../../src/app/landscape/LandscapeCache.js';

const RECEIPT = 'tests/artifacts/landscape_cache_history/cache-install-validation.json';
const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Cache bundle/directory must be an existing path'); return value; };

export const cacheInstallJob = {
    id: 'landscape/cache-install', always: true, configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'Authenticate a local landscape cache bundle file by file and optionally install it into the gitignored cache, manifest last',
    outputs: [RECEIPT],
    defaults: { directory: LANDSCAPE_DEFAULT_DIRECTORY },
    options: { bundle: pathOption, directory: pathOption },
    async inputs(ctx) {
        if (!ctx.options.bundle) throw new Error('Cache install requires --set landscape/cache-install:bundle=<landscape-cache-directory>');
        return listFiles(path.resolve(ctx.root, ctx.options.bundle));
    },
    async run(ctx) {
        const bundle = await verifyLandscapeCacheBundle(path.resolve(ctx.root, ctx.options.bundle), { signal: ctx.signal });
        const directory = path.resolve(ctx.root, ctx.options.directory);
        const report = { passed: bundle.passed, problems: bundle.problems, landscapeId: bundle.landscapeId, revision: bundle.revision, files: bundle.files.length,
            bytes: bundle.bytes, records: bundle.records, pointers: bundle.pointers, verifiedBy: Object.fromEntries(['name', 'record', 'schema'].map(kind => [kind, bundle.files.filter(file => file.verifiedBy === kind).length])),
            destination: path.relative(ctx.root, directory).split(path.sep).join('/'), published: false };
        const reportFile = path.join(ctx.stage, 'validation.json');
        await writeJson(reportFile, report);
        if (!bundle.passed) throw new Error(`Landscape cache bundle failed authentication (${bundle.problems.length} problems; ${reportFile}): ${bundle.problems.slice(0, 3).join('; ')}`);
        await ctx.assertInputsStable();
        const files = [reportFile];
        if (ctx.publish) {
            files.push(...await installLandscapeCacheBundle(bundle, directory, { signal: ctx.signal }));
            const installed = await verifyLandscapeCacheBundle(directory, { signal: ctx.signal });
            if (!installed.passed) throw new Error(`Installed landscape cache failed authentication: ${installed.problems.slice(0, 3).join('; ')}`);
            report.published = true;
            report.installed = { files: installed.files.length, bytes: installed.bytes, pointers: installed.pointers, revision: installed.revision };
            await writeJson(reportFile, report);
        }
        const evidence = path.join(ctx.root, RECEIPT);
        await publishBakeFile(reportFile, evidence); files.push(evidence);
        ctx.log.line(ctx.id, `${bundle.files.length} files (${(bundle.bytes / 1048576).toFixed(1)} MiB) authenticated for ${bundle.landscapeId} revision ${bundle.revision}; ${ctx.publish ? `installed into ${report.destination}` : 'validated only (add --publish to install)'}`);
        return { state: ctx.publish ? 'published' : 'validated', directory, reportFile, files };
    },
    async validate(result) {
        const report = JSON.parse(await readFile(result.reportFile, 'utf8'));
        if (!report.passed) throw new Error('Landscape cache install receipt is not a passing validation');
        if (result.state === 'published' && !(await verifyLandscapeCacheBundle(result.directory)).passed) throw new Error('Installed landscape cache no longer authenticates');
    }
};
