// Restore a valid packed litter map through the shared staging/publication gates.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { hashFile, listFiles } from '../../baking/Files.mjs';
import { publishBakeFile } from '../../baking/Publication.mjs';

async function validate(result) {
    const report = JSON.parse(await readFile(path.join(result.directory, 'repair.json'), 'utf8'));
    if (report.schema !== 'bus-simulator.dry-litter-orm-repair' || report.version !== 1
        || report.preservedRoughnessRows !== 939 || report.reconstructedRoughnessRows !== 85
        || report.independentlyVerifiedRows !== 358 || report.exactOriginalRoughnessRecovery !== false
        || (await hashFile(path.join(result.directory, 'arm.png'))).sha256 !== report.outputSha256)
        throw new Error('Invalid dry-litter repair');
}

export const dryLitterJob = {
    id: 'materials/dry_litter', description: 'Repair the truncated user-supplied litter ORM, preserving intact data',
    configurationPaths: ['pythonExecutable'], outputs: ['assets/public/pbr/dry_litter/arm.png', 'assets/public/pbr/dry_litter/repair.json'],
    inputs: async ctx => [...await listFiles(path.join(ctx.root, 'assets/public/pbr/dry_litter/source')),
        path.join(ctx.root, 'tools/bake_materials/dry_litter/repair.py'), path.join(ctx.root, 'tools/bake_materials/dry_litter/job.mjs')],
    async run(ctx) {
        const directory = path.join(ctx.stage, 'dry_litter');
        await ctx.process(ctx.config.pythonExecutable, [path.join(ctx.root, 'tools/bake_materials/dry_litter/repair.py'),
            '--source', path.join(ctx.root, 'assets/public/pbr/dry_litter/source'), '--output', directory]);
        const result = { state: 'validated', directory, files: await listFiles(directory) };
        await validate(result);
        if (ctx.publish) {
            await ctx.assertInputsStable();
            for (const name of ['arm.png', 'repair.json']) {
                const destination = path.join(ctx.root, 'assets/public/pbr/dry_litter', name);
                await publishBakeFile(path.join(directory, name), destination); result.files.push(destination);
            }
            result.state = 'published';
        }
        return result;
    }, validate
};
