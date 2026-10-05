// Builds review-only LOD0 derivatives without mutating the authenticated mature references.
// @ts-check
import path from 'node:path';
import {mkdir, readFile} from 'node:fs/promises';
import {listFiles, hashFile, writeJson} from '../../baking/Files.mjs';
import {bakeOption} from '../../baking/Options.mjs';
import {runHeadlessBake} from '../../baking/Blender.mjs';
import {reuseWood} from './Reuse.mjs';

const positive = value => { const n = Number(value); if (!Number.isInteger(n) || n < 1) throw new Error('Expected a positive integer'); return n; };
export const lod0Job = {
    id: 'vegetation/lod0', blender: true, always: true, configurationPaths: ['executable', 'renderDevice'],
    description: 'Bake mature reference wood and leaf sprays into separate LOD0 assets and matched Cycles comparisons',
    defaults: {phase: 'inspect', models: 'all', output: 'tests/artifacts/screens/ai589_lod0_vegetation/final',
        scene: 'tests/artifacts/screens/ai588_trunk_growth/final', width: 1920, samples: 64, 'wood-size': 2048, 'tile-size': 256, views: 'all', shading: 'physical', placement: 'direction', representations: 'all', baseline: ''},
    options: {phase: bakeOption.choice(['inspect', 'atlas', 'wood', 'cards', 'compress', 'gallery', 'revision-gallery', 'core-gallery', 'wireframe', 'spatial-build', 'canopy', 'build', 'render', 'all']), models: String, output: String, scene: String, baseline: String,
        width: positive, samples: bakeOption.samples, device: bakeOption.device, 'wood-size': positive, 'tile-size': positive, views: String, shading: bakeOption.choice(['physical', 'albedo']), placement: bakeOption.choice(['direction', 'spatial', 'core']), representations: bakeOption.choice(['all', 'lod0'])},
    async inputs(ctx) {
        const files = (await listFiles(path.join(ctx.root, 'tools/bake_vegetation'))).filter(file => /\.(mjs|js|py|json|html|css)$/.test(file));
        const reference = path.resolve(ctx.root, ctx.options.scene);
        const encoder = ['compress', 'all'].includes(ctx.options.phase) ? ['libktx.js', 'libktx.wasm'].map(name => path.join(ctx.root, 'downloads/tools/ktx-4.4.2', name)) : [];
        const baseline = ctx.options.baseline ? (await listFiles(path.resolve(ctx.root, ctx.options.baseline))).filter(file => /(?:wood\.blend|wood\.json|bark_\w+\.png|model\.json|reference\.json|inspection\.json|summary\.json|mature_0[123]_lod0\.glb|canopy[\\/](?:atlas\.json|leaf_\w+\.png)|comparisons[\\/].*\.(?:png|json))$/.test(file)) : [];
        return [...files, ...encoder, ...baseline, path.join(reference, 'mature_tree_arboretum.blend'), path.join(reference, 'scene.json')];
    },
    async run(ctx) {
        if (ctx.publish) throw new Error('LOD0 review assets must not replace gameplay trees');
        const source = path.resolve(ctx.root, ctx.options.scene), output = path.resolve(ctx.root, ctx.options.output);
        const relative = path.relative(path.join(ctx.root, 'tests/artifacts/screens'), output);
        const nested = value => value !== '..' && !value.startsWith('..' + path.sep) && !path.isAbsolute(value);
        const overlaps = [path.relative(source, output), path.relative(output, source)].some(nested);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || overlaps) throw new Error('Output must be a separate review directory under tests/artifacts/screens');
        const baseline = ctx.options.baseline ? path.resolve(ctx.root, ctx.options.baseline) : null;
        if (baseline && [path.relative(baseline, output), path.relative(output, baseline)].some(nested)) throw new Error('Revision output must not overlap the current LOD0 baseline');
        if (ctx.options.placement === 'spatial' && path.relative(path.resolve(ctx.root, lod0Job.defaults.output), output) === '') throw new Error('Spatial revisions require a new output directory');
        if (['spatial-build', 'revision-gallery'].includes(ctx.options.phase) && (!baseline || ctx.options.placement !== 'spatial')) throw new Error('Spatial revision requires its separate baseline and spatial placement');
        if (ctx.options.placement === 'core' && (!baseline || path.relative(path.resolve(ctx.root, lod0Job.defaults.output), output) === '')) throw new Error('Core canopy revisions require a preserved baseline and a new output directory');
        if (['core-gallery', 'wireframe'].includes(ctx.options.phase) && ctx.options.placement !== 'core') throw new Error('Core review phase requires core placement');
        const reference = JSON.parse(await readFile(path.join(source, 'scene.json'), 'utf8'));
        if (reference.growthRevision !== 'species-growth-v1' || reference.inventory.length !== 15) throw new Error('Expected the complete, detailed mature growth reference');
        const available = reference.inventory.map(row => row.species + '/' + row.variant);
        const models = ctx.options.models === 'all' ? available : ctx.options.models.split(',');
        if (!models.length || new Set(models).size !== models.length || models.some(id => !available.includes(id))) throw new Error('Unknown or repeated mature model');
        const fingerprint = await hashFile(path.join(source, 'mature_tree_arboretum.blend'));
        await mkdir(output, {recursive: true});
        const identityPath = path.join(output, 'reference.json');
        const existing = await readFile(identityPath, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
        if (existing && JSON.parse(existing).sha256 !== fingerprint.sha256) throw new Error('This output belongs to a different immutable reference');
        await writeJson(identityPath, {...fingerprint, source, scene: 'mature_tree_arboretum.blend'});
        const options = {...ctx.options, models, root: ctx.root, source, output, baseline, device: ctx.options.device ?? ctx.config.renderDevice};
        const optionsFile = path.join(ctx.stage, 'lod0-options.json'); await writeJson(optionsFile, options);
        const previous = ctx.env;
        ctx.env = {...ctx.env, OMP_NUM_THREADS: '4', OPENBLAS_NUM_THREADS: '2', TBB_NUM_THREADS: '4'};
        try {
            if (options.phase === 'spatial-build') {
                await reuseWood(options);
                await runHeadlessBake(ctx, 'tools/bake_vegetation/lod0/run.py', [optionsFile]);
            } else if (['compress', 'gallery', 'revision-gallery', 'core-gallery'].includes(options.phase)) {
                const script = {compress: 'Compress.mjs', gallery: 'Gallery.mjs', 'revision-gallery': 'RevisionGallery.mjs', 'core-gallery': 'CoreGallery.mjs'}[options.phase];
                await ctx.process(process.execPath, [path.join(ctx.root, 'tools/bake_vegetation/lod0', script), optionsFile]);
            } else if (options.phase === 'all') {
                await writeJson(optionsFile, {...options, phase: 'build'});
                await runHeadlessBake(ctx, 'tools/bake_vegetation/lod0/run.py', [optionsFile]);
                await ctx.process(process.execPath, [path.join(ctx.root, 'tools/bake_vegetation/lod0/Compress.mjs'), optionsFile]);
                await writeJson(optionsFile, {...options, phase: 'render'});
                await runHeadlessBake(ctx, 'tools/bake_vegetation/lod0/run.py', [optionsFile]);
                await ctx.process(process.execPath, [path.join(ctx.root, 'tools/bake_vegetation/lod0/Gallery.mjs'), optionsFile]);
            } else await runHeadlessBake(ctx, 'tools/bake_vegetation/lod0/run.py', [optionsFile]);
        }
        finally { ctx.env = previous; }
        await ctx.assertInputsStable();
        ctx.log.line(ctx.id, `LOD0 ${options.phase} completed: ${output}`);
        return {state: 'validated', directory: output, files: await listFiles(output)};
    }
};
