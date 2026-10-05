// Renders existing mature assets without publishing or rebuilding gameplay vegetation.
// @ts-check
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { listFiles, writeJson, hashFile } from '../../baking/Files.mjs';
import { bakeOption } from '../../baking/Options.mjs';
import { runHeadlessBake } from '../../baking/Blender.mjs';
import { writeGallery } from './Gallery.mjs';

const TOOL = 'tools/bake_vegetation/showcase';
const ARTIFACTS = 'tests/artifacts/screens/ai585_warm_bark';
const FOLDERS = ['london_plane', 'silver_linden', 'northern_red_oak', 'arrowwood_viburnum', 'american_elm'];
const boundedWidth = value => {
    const width = Number(value);
    if (!Number.isInteger(width) || width < 640 || width > 3840 || width % 16) throw new Error('width must be a multiple of 16 between 640 and 3840');
    return width;
};
const sceneDirectory = ctx => path.resolve(ctx.root, ctx.options.scene);

export const showcaseJob = {
    id: 'vegetation/showcase', blender: true, always: true, configurationPaths: ['executable', 'renderDevice'],
    description: 'Build warm brown bark across five species and render overviews plus trunk/root close-ups in headless Cycles',
    defaults: { phase: 'all', width: 2560, samples: 128, views: 'all' },
    options: { phase: bakeOption.choice(['all', 'build', 'render']), width: boundedWidth, samples: bakeOption.samples,
        device: bakeOption.device, views: String, scene: String },
    async inputs(ctx) {
        const inputs = (await listFiles(path.join(ctx.root, 'tools/bake_vegetation'))).filter(file => /\.(py|mjs|json)$/.test(file));
        if (ctx.options.phase === 'render') {
            if (!ctx.options.scene) throw new Error('render phase requires scene=<existing scene directory>');
            inputs.push(path.join(sceneDirectory(ctx), 'scene.json'), path.join(sceneDirectory(ctx), 'mature_tree_arboretum.blend'));
        } else {
            for (const folder of FOLDERS) {
                const directory = path.join(ctx.root, 'assets/public/vegetation', folder);
                inputs.push(path.join(directory, 'index.json'));
                for (const variant of ['mature_01', 'mature_02', 'mature_03']) inputs.push(path.join(directory, 'authoring', variant + '.blend'));
            }
            inputs.push(...['basecolor.jpg', 'normal_gl.png', 'arm.png'].map(file => path.join(ctx.root, 'assets/public/pbr/brown_mud', file)));
            inputs.push(path.join(ctx.root, 'assets/public/lighting/hdri/kloofendal_43d_clear_puresky_4k.hdr'));
        }
        return inputs;
    },
    async run(ctx) {
        if (ctx.publish) throw new Error('Vegetation showcase is a review artifact and cannot publish');
        const directory = path.join(ctx.root, ARTIFACTS, `run-${Date.now()}`);
        await mkdir(directory, { recursive: true });
        const source = ctx.options.phase === 'render' ? sceneDirectory(ctx) : directory;
        const previous = ctx.env;
        ctx.env = { ...ctx.env, OMP_NUM_THREADS: '4', OPENBLAS_NUM_THREADS: '2', TBB_NUM_THREADS: '4' };
        try {
            if (ctx.options.phase !== 'render') {
                for (const folder of FOLDERS) {
                    const base = path.join(ctx.root, 'assets/public/vegetation', folder);
                    const manifest = JSON.parse(await readFile(path.join(base, 'index.json'), 'utf8'));
                    for (const row of manifest.variants) {
                        const expected = row.woodyDetail.sourceBlend;
                        const actual = await hashFile(path.join(base, expected.file));
                        if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw new Error(`Source blend changed: ${folder}/${row.id}`);
                    }
                }
                await runHeadlessBake(ctx, TOOL + '/scene.py', [ctx.root, source]);
            }
            const manifest = JSON.parse(await readFile(path.join(source, 'scene.json'), 'utf8'));
            if (manifest.inventory.length !== 15 || manifest.plots.length !== 5) throw new Error('Showcase is missing original models or species plots');
            const expectedViews = manifest.schema === 'vegetation-cycles-showcase-v2' ? 21 : 11;
            if (manifest.views.length !== expectedViews) throw new Error('Showcase is missing required cameras');
            if (expectedViews === 21 && (manifest.views.filter(view => view.closeup).length !== 10
                || manifest.inventory.some(model => model.barkAppearance?.revision !== 'warm-brown-bark-v1'))) throw new Error('Warm bark or close-up views are missing');
            if (ctx.options.phase !== 'build') {
                const views = ctx.options.views === 'all' ? manifest.views.map(view => view.id) : ctx.options.views.split(',');
                if (new Set(views).size !== views.length || views.some(id => !manifest.views.some(view => view.id === id))) throw new Error('Unknown or duplicate showcase camera');
                const options = { ...ctx.options, device: ctx.options.device ?? ctx.config.renderDevice };
                const optionFile = path.join(directory, 'render-options.json');
                await writeJson(optionFile, options);
                await runHeadlessBake(ctx, TOOL + '/render.py', [source, directory, optionFile]);
                const report = JSON.parse(await readFile(path.join(directory, 'renders.json'), 'utf8'));
                if (report.renders.length !== views.length || report.engine !== 'CYCLES') throw new Error('Incomplete Cycles render set');
                const hashes = new Set();
                for (const image of report.renders) {
                    const png = await readFile(path.join(directory, image.file));
                    if (png.readUInt32BE(16) !== options.width || png.readUInt32BE(20) !== options.width * 9 / 16 || png.length < 10000) throw new Error('Invalid rendered image');
                    const { sha256 } = await hashFile(path.join(directory, image.file));
                    if (hashes.has(sha256)) throw new Error('Distinct camera poses produced duplicate images');
                    hashes.add(sha256);
                }
                await writeGallery(directory, source, manifest, report);
            }
        } finally { ctx.env = previous; }
        await ctx.assertInputsStable();
        ctx.log.line(ctx.id, `Scene: ${source}; evidence: ${directory}`);
        return { state: 'validated', directory, scene: source, files: await listFiles(directory) };
    }
};
