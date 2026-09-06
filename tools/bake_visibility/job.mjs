// Runs the current conservative visibility-table baker with native-resolution validation.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles } from '../baking/Files.mjs';
import { publishBakeFile } from '../baking/Publication.mjs';

export const visibilityJob = {
    id: 'visibility', description: 'BigCity2 conservative PVS table and zero-miss native validation',
    dependencies: ['lighting/source'], outputs: ['src/app/city/visibility/bakes/bigcity2.v1.json'],
    async inputs(ctx) { return [path.join(ctx.root, 'tools/static_visibility_baker/run.mjs'),
        ...(await listFiles(path.join(ctx.root, 'src/app/city/visibility'))).filter(file => !file.includes(`${path.sep}bakes${path.sep}`)),
        path.join(ctx.root, 'src/graphics/visuals/city/StaticVisibilityRenderBridge.js'),
        path.join(ctx.root, 'src/graphics/visuals/city/CityStaticVisibility.js')]; },
    async run(ctx) {
        const table = path.join(ctx.stage, 'bigcity2.v1.json'), report = path.join(ctx.stage, 'report.json');
        await ctx.node('tools/static_visibility_baker/run.mjs', ['--output', table, '--report', report]);
        const result = { state: 'validated', table, report, files: [table, report] };
        await validateVisibility(result);
        if (ctx.publish) {
            await ctx.assertInputsStable();
            const destination = path.join(ctx.root, 'src/app/city/visibility/bakes/bigcity2.v1.json');
            await publishBakeFile(table, destination); result.files.push(destination); result.state = 'published';
        }
        return result;
    }, validate: validateVisibility
};

export async function validateVisibility(result) {
    const report = JSON.parse(await readFile(result.report, 'utf8'));
    const table = JSON.parse(await readFile(result.table, 'utf8'));
    if (report.validation.missesAfterRepair !== 0 || table.bake.missesAfterRepair !== 0 || report.cityConfigHash !== table.cityConfigHash) throw new Error('Visibility bake did not pass native validation');
}
