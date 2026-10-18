// Registers opt-in building authoring without changing production bake parents.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runHeadlessBake } from '../baking/Blender.mjs';
import { hashFile, listFiles } from '../baking/Files.mjs';
import { rebuildJobs } from './rebuild_jobs.mjs';

const INPUT = 'blender_inputs/bradbury/baseline';
const SCRIPT = 'blender/scripts/bradbury/building/import_baseline.py';

/** @param {unknown} value */
function outputOption(value) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('output must be a new .blend path');
    return value;
}

export const bradburyBaselineJob = {
    id: 'buildings/bradbury/baseline', configurationPaths: ['executable'], always: true,
    description: 'Import preserved Bradbury GLB, link installed textures, and verify a new baseline candidate',
    outputs: ['blender_files/bradbury/baseline'], options: { output: outputOption, glb: outputOption },
    async inputs(ctx) {
        if (ctx.publish) throw new Error('Baseline import creates a validated candidate only; --publish is not supported');
        const source = JSON.parse(await readFile(path.join(ctx.root, INPUT, 'source.json'), 'utf8'));
        return [...new Set([
            `${INPUT}/source.json`, ...source.baseline_import.inputs.map(entry => entry.file),
            SCRIPT, 'blender/scripts/bradbury/building/baseline_validation.py',
            'blender/scripts/bradbury/building/baseline_recipe.json',
            'blender/scripts/bradbury/building/link_game_textures.py', 'blender/scripts/common/paths.py',
            'tools/bake_buildings/jobs.mjs', ctx.config.executable,
            ...(ctx.options.glb ? [ctx.options.glb] : [])
        ])].map(file => path.resolve(ctx.root, file));
    },
    async run(ctx) {
        const filesRoot = path.resolve(process.env.BLENDER_FILES_ROOT || path.join(ctx.root, 'blender_files'));
        const runId = path.basename(path.dirname(path.dirname(path.dirname(ctx.stage))));
        const output = ctx.options.output ? path.resolve(ctx.root, ctx.options.output)
            : path.join(filesRoot, 'bradbury/baseline/candidates', runId, 'bradbury_block_before.blend');
        const report = path.join(ctx.stage, 'baseline-validation.json');
        await runHeadlessBake(ctx, SCRIPT, ['--output', output, '--report', report,
            ...(ctx.options.glb ? ['--glb', path.resolve(ctx.root, ctx.options.glb)] : [])]);
        await ctx.assertInputsStable();
        const result = { state: 'validated', output, report, files: [output, report] };
        return result;
    },
    async validate(result) {
        const report = JSON.parse(await readFile(result.report, 'utf8'));
        if (!report.passed || report.output !== result.output || report.sha256 !== (await hashFile(result.output)).sha256) {
            throw new Error('Bradbury baseline validation receipt does not authenticate its candidate');
        }
    }
};

export const terramarCatalogJob = {
    id: 'buildings/terramar/catalog-check', configurationPaths: ['executable'], always: true,
    description: 'Rebuild Terra & Mar from installed catalog maps into fresh candidates; reopen all dependencies',
    outputs: ['blender_files/terramar/catalog-candidates'],
    async inputs(ctx) {
        if (ctx.publish) throw new Error('Catalog check creates candidates only; --publish is not supported');
        const filesRoot = path.resolve(process.env.BLENDER_FILES_ROOT || path.join(ctx.root, 'blender_files'));
        const directories = ['blender/scripts/terramar', 'blender/scripts/city', 'blender/scripts/common',
            'blender_inputs/terramar/sign', 'blender_inputs/terramar/vegetation',
            'assets/public/pbr/terramar_continuous_limestone', 'assets/public/pbr/terramar_sign_coastal_kitchen',
            'assets/public/pbr/terramar_sign_terra_and_mar', 'assets/public/pbr/brown_mud'];
        return [...(await Promise.all(directories.map(directory => listFiles(path.join(ctx.root, directory))))).flat()
            .filter(file => !file.includes('__pycache__')),
            ...await listFiles(path.join(filesRoot, 'terramar/baseline')),
            ...await listFiles(path.join(filesRoot, 'city')),
            path.join(ctx.root, 'assets/public/pbr/_catalog_index.js'),
            path.join(ctx.root, 'tools/bake_buildings/jobs.mjs'), ctx.config.executable];
    },
    async run(ctx) {
        const source = path.resolve(process.env.BLENDER_FILES_ROOT || path.join(ctx.root, 'blender_files'));
        const runId = path.basename(path.dirname(path.dirname(path.dirname(ctx.stage))));
        const output = path.join(source, 'terramar/catalog-candidates', runId);
        const report = path.join(ctx.stage, 'catalog-validation.json');
        await runHeadlessBake(ctx, 'blender/scripts/terramar/building/rebuild/catalog_check.py',
            ['--source-root', source, '--output-root', output, '--report', report]);
        const data = JSON.parse(await readFile(report, 'utf8'));
        return { state: 'validated', output, report, files: [report, ...data.files.map(entry => entry.file)] };
    },
    async validate(result) {
        const report = JSON.parse(await readFile(result.report, 'utf8'));
        if (!report.passed || report.output_root !== result.output || report.files.length !== 7) {
            throw new Error('Terra & Mar catalog candidate validation failed');
        }
        for (const entry of report.files) {
            if ((await hashFile(entry.file)).sha256 !== entry.sha256) throw new Error(`Candidate changed: ${entry.file}`);
        }
    }
};

export const buildingJobs = Object.freeze([bradburyBaselineJob, terramarCatalogJob, ...rebuildJobs, {
    id: 'buildings', configurationPaths: ['executable'],
    description: 'Explicit building authoring; currently Bradbury baseline import only',
    children: ['buildings/bradbury/baseline']
}]);
