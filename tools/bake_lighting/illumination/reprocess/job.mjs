// Reuses authenticated Cycles samples when only filtering/encoding has changed.
import path from 'node:path';
import { mkdir, readFile, link } from 'node:fs/promises';
import { listFiles, hashFile } from '../../../baking/Files.mjs';
import { runHeadlessBake } from '../../../baking/Blender.mjs';
import { validateReceiverPass } from '../ReceiverJobs.mjs';

export async function validateUnpublishedReceiverBake(from) {
    const atlas=JSON.parse(await readFile(path.join(from,'atlas.json')));
    if(atlas.profile?.irradianceRepresentation!=='surface-diffuse-v1')throw new Error('Only complete surface bakes support sample reprocessing');
    const receipts=[];
    for(const pass of ['bounce','sky']) {
        await validateReceiverPass({stage:from,pass});
        receipts.push(JSON.parse(await readFile(path.join(from,`${pass}.receipt.json`))));
    }
    if(JSON.stringify(receipts[0].signature)!==JSON.stringify(receipts[1].signature))throw new Error('Different Blender builds in pass receipts');
    return atlas.profile;
}

const files = async ctx => {
    const from = path.resolve(ctx.root, ctx.options.publication ?? ctx.options.staging ?? '');
    const layout = path.resolve(ctx.root, ctx.options.layout ?? '');
    if (Number(!!ctx.options.publication)+Number(!!ctx.options.staging)!==1 || !ctx.options.layout
        || (ctx.options.publication && !/^[a-f0-9]{64}$/.test(path.basename(from)))
        || (ctx.options.staging && !from.endsWith('.partial'))) {
        throw new Error('Reprocess requires exactly one of :publication=<completed-directory> or :staging=<completed-passes.partial>, and :layout=<original-layout.json>');
    }
    return [layout, ...(await listFiles(from)).filter(file => /(?:sky|bounce)\.\d+\.npy$|(?:package_index|job|atlas|receipt)\.json$|source\.bsib$|charts\.ndjson$|direct_receiver\.0\.mip0\.f32$/.test(file)),
        ...(await listFiles(path.join(ctx.root, 'tools/receiver_lightmaps'))).filter(file => /\.(mjs|py)$/.test(file)),
        ...(await listFiles(path.join(ctx.root, 'src/app/illumination'))).filter(file => file.endsWith('.js'))];
};

export const receiverReprocessJob = {
    id: 'lighting/illumination/reprocess', description: 'Refilter authenticated sky/bounce samples without repeating Cycles',
    dependencies: ['lighting/source'], inputs: files, blender: true, outputs: ['lighting/illumination/reprocessed-packages'],
    options: { publication: String, staging: String, layout: String },
    async run(ctx) {
        const from = path.resolve(ctx.root, ctx.options.publication ?? ctx.options.staging), layout = path.resolve(ctx.root, ctx.options.layout);
        const profile = ctx.options.staging ? await validateUnpublishedReceiverBake(from)
            : JSON.parse(await readFile(path.join(from, 'package_index.json'))).mapping.profile;
        if (profile.irradianceRepresentation !== 'surface-diffuse-v1') throw new Error('Only complete surface bakes support sample reprocessing');
        if ((await hashFile(ctx.result('lighting/source').source)).sha256 !== (await hashFile(path.join(from, 'source.bsib'))).sha256) {
            throw new Error('Current city differs from the recovered bake source; a fresh bake is required');
        }
        const output = path.join(ctx.stage, 'bake'), original = path.join(output, path.basename(from));
        await mkdir(original, { recursive: true });
        for (const file of (await files(ctx)).filter(file => path.dirname(file) === from)) {
            if(ctx.options.staging&&['receipt.json','direct_receiver.0.mip0.f32'].includes(path.basename(file)))continue;
            await link(file, path.join(original, path.basename(file)));
        }
        if(ctx.options.staging) {
            // Rebuild the consolidation receipt and outputs from both verified
            // passes. Never reuse partially written assembled/filtered maps.
            await runHeadlessBake(ctx,'tools/receiver_lightmaps/blender/consolidate_passes.py',[original]);
        }
        await ctx.node('tools/receiver_lightmaps/run.mjs', ['--input', ctx.result('lighting/source').source, '--output', output,
            '--enhanced', 'true', '--layout', layout, '--samples', profile.samples, '--device', profile.device,
            '--blender', ctx.config.executable, '--installed', 'true', ctx.options.staging?'--resume':'--reprocess', original]);
        await ctx.assertInputsStable();
        await ctx.node('tools/receiver_lightmaps/publish.mjs', ['--enhanced', '--from', output, ...ctx.publish ? [] : ['--validate-only']]);
        const latest = JSON.parse(await readFile(path.join(output, 'latest.json'))), folder = path.join(output, latest.directory);
        const outputs = (await listFiles(folder)).filter(file => /\.ilpkg\.gz$|(?:package_index|metrics)\.json$/.test(file));
        if (ctx.publish) outputs.push(...await listFiles(path.join(ctx.root, 'assets/baked_lighting/receivers/enhanced', latest.directory)),
            path.join(ctx.root, 'assets/baked_lighting/receivers/enhanced/package_index.json'));
        return { state: ctx.publish ? 'published' : 'validated', output, folder, files: outputs };
    }
};
