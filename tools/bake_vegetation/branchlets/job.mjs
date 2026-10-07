// Rebuilds only exterior foliage in preserved LOD0 and LOD1 review models.
// @ts-check
import path from 'node:path';
import {mkdir, readFile} from 'node:fs/promises';
import {listFiles, writeJson, hashFile} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';

export const branchletsJob = {
    id: 'vegetation/branchlets', blender: true, always: true,
    configurationPaths: ['executable', 'renderDevice', 'browserExecutable'],
    description: 'Connected branchlet edge cards for both mature LODs; accepted wood preserved',
    defaults: {phase: 'atlas', models: 'all', lod: 'both',
        source0: 'tests/artifacts/screens/ai591_core_canopies/final',
        source1: 'tests/artifacts/screens/ai593_lod1_canopies/final',
        scene: 'tests/artifacts/screens/ai588_trunk_growth/final',
        output: 'tests/artifacts/screens/ai594_branchlet_canopies/final', width: 1200, samples: 32},
    options: {phase: bakeOption.choice(['atlas', 'build', 'compress', 'render', 'gallery', 'validate']),
        models: String, lod: bakeOption.choice(['both', '0', '1']), source0: String, source1: String,
        scene: String, output: String, width: Number, samples: bakeOption.samples, device: bakeOption.device},
    async inputs(ctx) {
        const files = [...await listFiles(path.join(ctx.root, 'tools/bake_vegetation/branchlets')),
            ...(await listFiles(path.join(ctx.root, 'tools/bake_vegetation/lod0'))).filter(f => /\.(py|mjs)$/.test(f)),
            ...(await listFiles(path.join(ctx.root, 'tools/bake_vegetation/lod1'))).filter(f => /\.(py|mjs)$/.test(f)),
            path.join(ctx.root, 'assets/public/vegetation_lod0/index.json'),
            path.resolve(ctx.root, ctx.options.scene, 'mature_tree_arboretum.blend')];
        for (const key of ['source0', 'source1']) files.push(...(await listFiles(path.resolve(ctx.root, ctx.options[key])))
            .filter(f => /(?:wood\.(?:blend|json)|layout\.json|placement\.json|model\.json|compression\.json|mature_0[123]_lod[01](?:_source|_review)?\.glb|[\\/]bark_.*\.(?:png|ktx2)|[\\/]canopy[\\/](?:atlas\.json|leaf_.*\.png))$/.test(f)));
        if (ctx.options.phase === 'compress') for (const file of ['libktx.js', 'libktx.wasm']) files.push(path.join(ctx.root, 'downloads/tools/ktx-4.4.2', file));
        return files;
    },
    async run(ctx) {
        if (ctx.publish) throw new Error('Branchlet revisions are review-only');
        const options = {...ctx.options, root: ctx.root, device: ctx.options.device ?? ctx.config.renderDevice,
            browserExecutable: ctx.config.browserExecutable};
        for (const key of ['source0', 'source1', 'scene', 'output']) options[key] = path.resolve(ctx.root, options[key]);
        const inside = (a, b) => {const rel = path.relative(a, b); return !rel.startsWith('..') && !path.isAbsolute(rel);};
        if (options.output === path.join(ctx.root, 'tests/artifacts/screens') || !inside(path.join(ctx.root, 'tests/artifacts/screens'), options.output)
            || ['source0', 'source1', 'scene'].some(k => inside(options[k], options.output) || inside(options.output, options[k]))) throw new Error('Use a separate review output');
        const manifest = JSON.parse(await readFile(path.join(ctx.root, 'assets/public/vegetation_lod0/index.json'), 'utf8'));
        options.models = options.models === 'all' ? manifest.models.map(row => row.id) : options.models.split(',');
        if (!options.models.length || new Set(options.models).size !== options.models.length || options.models.some(id => !manifest.models.some(row => row.id === id))) throw new Error('Unknown model selection');
        if (!Number.isInteger(options.width) || options.width < 512 || options.width > 3840) throw new Error('Invalid render width');
        for (const id of options.models) {
            const row = manifest.models.find(row => row.id === id);
            if ((await hashFile(path.join(options.source0, id, id.split('/')[1]+'_lod0.glb'))).sha256 !== row.sourceGlb.sha256) throw new Error('LOD0 source differs from the installed accepted set');
        }
        options.levels = options.lod === 'both' ? [0, 1] : [Number(options.lod)];
        await mkdir(options.output, {recursive: true});
        const file = path.join(ctx.stage, 'branchlet-options.json'); await writeJson(file, options);
        const previous = ctx.env; ctx.env = {...ctx.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '1', TBB_NUM_THREADS: '2'};
        try {
            if (['compress', 'gallery', 'validate'].includes(options.phase)) await ctx.process(process.execPath, [path.join(ctx.root, 'tools/bake_vegetation/branchlets/Stage.mjs'), file]);
            else await runHeadlessBake(ctx, 'tools/bake_vegetation/branchlets/run.py', [file]);
            await ctx.assertInputsStable();
        } finally {ctx.env = previous;}
        return {state: 'validated', directory: options.output, files: await listFiles(options.output)};
    }
};
