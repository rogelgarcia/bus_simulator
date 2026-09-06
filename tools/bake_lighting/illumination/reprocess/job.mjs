// Reuses authenticated Cycles samples when only filtering/encoding has changed.
import path from 'node:path';
import { mkdir, readFile, link } from 'node:fs/promises';
import { listFiles, hashFile } from '../../../baking/Files.mjs';

const files = async ctx => {
    const from = path.resolve(ctx.root, ctx.options.publication ?? '');
    const layout = path.resolve(ctx.root, ctx.options.layout ?? '');
    if (!ctx.options.publication || !ctx.options.layout || !/^[a-f0-9]{64}$/.test(path.basename(from))) {
        throw new Error('Reprocess requires --set lighting/illumination/reprocess:publication=<completed-directory> and :layout=<original-layout.json>');
    }
    return [layout, ...(await listFiles(from)).filter(file => /(?:sky|bounce)\.\d+\.npy$|(?:package_index|job|atlas|receipt)\.json$|source\.bsib$|charts\.ndjson$|direct_receiver\.0\.mip0\.f32$/.test(file)),
        ...(await listFiles(path.join(ctx.root, 'tools/receiver_lightmaps'))).filter(file => /\.(mjs|py)$/.test(file)),
        ...(await listFiles(path.join(ctx.root, 'src/app/illumination'))).filter(file => file.endsWith('.js'))];
};

export const receiverReprocessJob = {
    id: 'lighting/illumination/reprocess', description: 'Refilter authenticated sky/bounce samples without repeating Cycles',
    dependencies: ['lighting/source'], inputs: files, outputs: ['lighting/illumination/reprocessed-packages'],
    options: { publication: String, layout: String },
    async run(ctx) {
        const from = path.resolve(ctx.root, ctx.options.publication), layout = path.resolve(ctx.root, ctx.options.layout);
        const index = JSON.parse(await readFile(path.join(from, 'package_index.json'))), profile = index.mapping.profile;
        if (profile.irradianceRepresentation !== 'surface-diffuse-v1') throw new Error('Only complete surface bakes support sample reprocessing');
        if ((await hashFile(ctx.result('lighting/source').source)).sha256 !== (await hashFile(path.join(from, 'source.bsib'))).sha256) {
            throw new Error('Current city differs from the recovered bake source; a fresh bake is required');
        }
        const output = path.join(ctx.stage, 'bake'), original = path.join(output, path.basename(from));
        await mkdir(original, { recursive: true });
        for (const file of (await files(ctx)).filter(file => path.dirname(file) === from)) await link(file, path.join(original, path.basename(file)));
        await ctx.node('tools/receiver_lightmaps/run.mjs', ['--input', ctx.result('lighting/source').source, '--output', output,
            '--enhanced', 'true', '--layout', layout, '--samples', profile.samples, '--device', profile.device,
            '--blender', ctx.config.executable, '--installed', 'true', '--reprocess', original]);
        await ctx.assertInputsStable();
        await ctx.node('tools/receiver_lightmaps/publish.mjs', ['--enhanced', '--from', output, ...ctx.publish ? [] : ['--validate-only']]);
        const latest = JSON.parse(await readFile(path.join(output, 'latest.json'))), folder = path.join(output, latest.directory);
        const outputs = (await listFiles(folder)).filter(file => /\.ilpkg\.gz$|(?:package_index|metrics)\.json$/.test(file));
        if (ctx.publish) outputs.push(...await listFiles(path.join(ctx.root, 'assets/baked_lighting/receivers/enhanced', latest.directory)),
            path.join(ctx.root, 'assets/baked_lighting/receivers/enhanced/package_index.json'));
        return { state: ctx.publish ? 'published' : 'validated', output, folder, files: outputs };
    }
};
