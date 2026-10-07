// Generates review-only LOD1 derivatives through the shared authenticated headless bake framework.
// @ts-check
import path from 'node:path';
import {mkdir, readFile} from 'node:fs/promises';
import {listFiles, hashFile, writeJson} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {validateModels} from './Validate.mjs';

export const lod1Job = {
    id: 'vegetation/lod1', blender: true, always: true, configurationPaths: ['executable', 'renderDevice', 'browserExecutable'],
    description: 'Reorganize mature canopies and wood at 40% LOD0 triangles, with full-tree comparisons',
    defaults: {phase: 'build', models: 'all', source: 'tests/artifacts/screens/ai591_core_canopies/final',
        output: 'tests/artifacts/screens/ai593_lod1_canopies/final', scene: 'tests/artifacts/screens/ai588_trunk_growth/final',
        width: 1440, samples: 32, views: 'front', 'render-threads': 2},
    options: {phase: bakeOption.choice(['build', 'compress', 'render', 'gallery', 'validate', 'inspect-wood', 'geometry']), models: String, source: String, output: String,
        scene: String, width: Number, samples: bakeOption.samples, device: bakeOption.device, views: bakeOption.choice(['front', 'reverse', 'all']), 'render-threads': Number},
    async inputs(ctx) {
        const source = path.resolve(ctx.root, ctx.options.source);
        return [...await listFiles(path.join(ctx.root, 'tools/bake_vegetation/lod1')),
            ...(await listFiles(path.join(ctx.root, 'tools/bake_vegetation/lod0'))).filter(file => /\.(py|mjs)$/.test(file)),
            ...(await listFiles(source)).filter(file => /(?:wood\.blend|layout\.json|placement\.json|model\.json|compression\.json|revision\.json|reference-.*\.json|mature_0[123]_lod0(?:_review)?\.glb|[\\/]bark_.*\.(?:png|ktx2)|[\\/]canopy[\\/](?:atlas\.json|leaf_(?:color|normal|orm)\.png))$/.test(file)),
            path.join(ctx.root, 'assets/public/vegetation_lod0/index.json'),
            path.resolve(ctx.root, ctx.options.scene, 'mature_tree_arboretum.blend'),
            path.resolve(ctx.root, ctx.options.scene, 'scene.json'),
            ...(['compress'].includes(ctx.options.phase) ? ['libktx.js', 'libktx.wasm'].map(file => path.join(ctx.root, 'downloads/tools/ktx-4.4.2', file)) : [])];
    },
    async run(ctx) {
        if (ctx.publish) throw new Error('LOD1 is review-only; publication requires separate approval of the comparison results');
        const source = path.resolve(ctx.root, ctx.options.source), output = path.resolve(ctx.root, ctx.options.output);
        const inside = (a, b) => { const rel = path.relative(a, b); return !rel.startsWith('..') && !path.isAbsolute(rel); };
        if (!inside(path.join(ctx.root, 'tests/artifacts/screens'), output) || path.relative(path.join(ctx.root, 'tests/artifacts/screens'), output) === ''
            || inside(source, output) || inside(output, source)) throw new Error('LOD1 output must be a separate review directory');
        const manifest = JSON.parse(await readFile(path.join(ctx.root, 'assets/public/vegetation_lod0/index.json'), 'utf8'));
        const models = ctx.options.models === 'all' ? manifest.models.map(row => row.id) : ctx.options.models.split(',');
        if (!models.length || new Set(models).size !== models.length || models.some(id => !manifest.models.some(row => row.id === id))) throw new Error('Unknown LOD1 model selection');
        if (!Number.isInteger(ctx.options.width) || ctx.options.width < 512 || ctx.options.width > 3840) throw new Error('Invalid render width');
        if (!Number.isInteger(ctx.options['render-threads']) || ctx.options['render-threads'] < 1 || ctx.options['render-threads'] > 4) throw new Error('Render threads must be between one and four');
        for (const model of models) {
            const row = manifest.models.find(row => row.id === model), variant = model.split('/')[1];
            const hash = await hashFile(path.join(source, model, variant + '_lod0.glb'));
            if (hash.sha256 !== row.sourceGlb.sha256) throw new Error('LOD1 source differs from the installed LOD0');
        }
        await mkdir(output, {recursive: true});
        const options = {...ctx.options, root: ctx.root, source, output, models, lodLevel: 1, placement: 'core',
            scene: path.resolve(ctx.root, ctx.options.scene), device: ctx.options.device ?? ctx.config.renderDevice,
            browserExecutable: ctx.config.browserExecutable};
        const file = path.join(ctx.stage, 'lod1-options.json'); await writeJson(file, options);
        const previous = ctx.env;
        const threads = String(options.phase === 'render' ? options['render-threads'] : 2);
        ctx.env = {...ctx.env, OMP_NUM_THREADS: threads, OPENBLAS_NUM_THREADS: '1', TBB_NUM_THREADS: threads};
        try {
            if (options.phase === 'compress') await ctx.process(process.execPath, [path.join(ctx.root, 'tools/bake_vegetation/lod0/Compress.mjs'), file]);
            else if (options.phase === 'gallery') await ctx.process(process.execPath, [path.join(ctx.root, 'tools/bake_vegetation/lod1/Gallery.mjs'), file]);
            else if (options.phase !== 'validate') await runHeadlessBake(ctx, 'tools/bake_vegetation/lod1/run.py', [file]);
            if (!['geometry', 'inspect-wood'].includes(options.phase)) await validateModels(options);
            await ctx.assertInputsStable();
        } finally { ctx.env = previous; }
        return {state: 'validated', directory: output, files: await listFiles(output)};
    }
};
