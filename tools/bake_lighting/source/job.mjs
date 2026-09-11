// Exports the fully resolved current city once for all lighting descendants.
// @ts-check
import path from 'node:path';
import { validateResolvedCityBakePackage } from '../../../src/graphics/illumination/bake_source/BakeSourceValidation.js';
import { readFile } from 'node:fs/promises';
import { listFiles } from '../../baking/Files.mjs';

export const sourceJob = {
    id: 'lighting/source', always: true, outputs: ['source/current-city.bsib'],
    codePaths: ['tools/bake_lighting/source'],
    description: 'Resolve current BigCity2, wait for textures, export and validate twice',
    async inputs(ctx) { return [...await listFiles(path.join(ctx.root, 'src')),
        ...await listFiles(path.join(ctx.root, 'tools/illumination_bake_exporter'))]
        .filter(file => /\.(js|mjs|json|glsl)$/.test(file) && !file.includes(`${path.sep}bakes${path.sep}`)); },
    async run(ctx) {
        const source = path.join(ctx.stage, 'source.bsib');
        await ctx.node('tools/illumination_bake_exporter/run.mjs', ['--output', source, '--reports', path.join(ctx.stage, 'reports')]);
        return { state: 'validated', files: [source], source };
    },
    async validate(result) { await validateResolvedCityBakePackage(await readFile(result.source)); }
};
