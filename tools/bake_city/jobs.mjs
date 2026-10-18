// Registers independent city authoring as an explicit candidate-only bake.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runHeadlessBake } from '../baking/Blender.mjs';
import { hashFile, listFiles } from '../baking/Files.mjs';
import { createRebuildJob } from '../bake_buildings/rebuild_jobs.mjs';

const PBR = ['asphalt_02', 'rough_concrete', 'brown_mud', 'rock_ground', 'plastered_wall_02',
    'plastered_wall_05', 'corrugated_iron_02', 'red_brick', 'painted_plaster_wall',
    'beige_wall_001', 'plastered_wall_04', 'brick_wall_13', 'whitewashed_brick'];

export const cityStandaloneJob = {
    id: 'city/standalone-check', configurationPaths: ['executable'], always: true,
    description: 'Build the city and its context from installed assets in an empty candidate root',
    outputs: ['blender_files/city-candidates'],
    async inputs(ctx) {
        if (ctx.publish) throw new Error('City validation creates candidates only; --publish is not supported');
        const directories = ['blender/scripts/city', 'assets/trees/Models/Desktop', 'assets/trees/Textures',
            'assets/props/street_lamp_01', ...PBR.map(name => `assets/public/pbr/${name}`)];
        return [...(await Promise.all(directories.map(directory => listFiles(path.join(ctx.root, directory))))).flat()
            .filter(file => !file.includes('__pycache__')),
            ...['blender/scripts/common/paths.py', 'tools/bake_city/jobs.mjs',
                'assets/public/lighting/hdri/kloofendal_43d_clear_puresky_4k.hdr'].map(file => path.join(ctx.root, file)),
            ctx.config.executable];
    },
    async run(ctx) {
        const filesRoot = path.resolve(process.env.BLENDER_FILES_ROOT || path.join(ctx.root, 'blender_files'));
        const runId = path.basename(path.dirname(path.dirname(ctx.stage)));
        const output = path.join(filesRoot, 'city-candidates', runId);
        const report = path.join(ctx.stage, 'standalone-validation.json');
        await runHeadlessBake(ctx, 'blender/scripts/city/standalone_check.py',
            ['--files-root', filesRoot, '--output-root', output, '--report', report]);
        const data = JSON.parse(await readFile(report, 'utf8'));
        return { state: 'validated', output, report, files: [report, ...data.files.map(entry => entry.file)] };
    },
    async validate(result) {
        const report = JSON.parse(await readFile(result.report, 'utf8'));
        if (!report.passed || report.output_root !== result.output || report.files.length !== 3) {
            throw new Error('Independent city validation failed');
        }
        for (const entry of report.files) {
            if ((await hashFile(entry.file)).sha256 !== entry.sha256) throw new Error(`Candidate changed: ${entry.file}`);
        }
    }
};

export const cityJobs = Object.freeze([cityStandaloneJob, createRebuildJob('city/rebuild-all', 'city'), {
    id: 'city', description: 'Explicit reusable-city authoring', children: ['city/standalone-check']
}]);
