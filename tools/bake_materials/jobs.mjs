// Declares existing deterministic PBR material generators and their publication boundaries.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles } from '../baking/Files.mjs';
import { publishBakeDirectory } from '../baking/Publication.mjs';
import { grassJob } from './grass/job.mjs';

const families = [
    ['tools/modern_bank_pbr/run.mjs', ['burnt_cement_panel', 'bronze_anodized_panel']],
    ['tools/bradbury_generate_stone_pbr.mjs', ['red_sandstone_block', 'red_sandstone_noise', 'terracotta_smooth']],
    ['tools/ai491_generate_stone_pbr.mjs', ['rusticated_ashlar', 'limestone_smooth', 'brownstone']]
];

export async function validatePbr(result) {
    for (const name of ['basecolor.png', 'normal_gl.png', 'arm.png']) {
        const data = await readFile(path.join(result.directory, name));
        if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.readUInt32BE(16) !== 1024 || data.readUInt32BE(20) !== 1024) throw new Error(`Invalid material map ${name}`);
    }
    await readFile(path.join(result.directory, 'pbr.material.config.js'));
}

export const materialJobs = families.flatMap(([script, names]) => names.map(name => ({
    id: `materials/${name}`, description: `Generate ${name}: albedo, normal, packed AO/roughness/metalness`,
    outputs: [`assets/public/pbr/${name}`], inputs: ctx => [path.join(ctx.root, script)],
    async run(ctx) {
        await ctx.node(script, ['--output', ctx.stage, '--material', name]);
        const directory = path.join(ctx.stage, name);
        const result = { state: 'validated', directory, files: await listFiles(directory) };
        await validatePbr(result);
        if (ctx.publish) {
            await ctx.assertInputsStable();
            const destination = path.join(ctx.root, 'assets/public/pbr', name);
            await publishBakeDirectory(directory, destination);
            result.state = 'published'; result.files.push(...await listFiles(destination));
        }
        return result;
    }, validate: validatePbr
})));
materialJobs.push(grassJob, { id: 'materials', description: 'Existing grass and procedural PBR asset bakers', children: [...materialJobs.map(v => v.id), grassJob.id] });
