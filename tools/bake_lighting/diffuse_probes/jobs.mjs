// Registers spatial sky/bounce bakes and validates content before atomic publication.
import path from 'node:path';
import { readFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { bakeOption } from '../../baking/Options.mjs';
import { hashFile, writeJson, listFiles, digest } from '../../baking/Files.mjs';
import { runHeadlessBake } from '../../baking/Blender.mjs';
import { publishBakeFile } from '../../baking/Publication.mjs';
import { parseBakeSourcePackage } from '../../../src/app/illumination/bake_source/index.js';
import { validateDiffuseProbeField, DIFFUSE_PROBE_SCHEMA, DIFFUSE_PROBE_WIDTH } from '../../../src/app/illumination/diffuse_probes/DiffuseProbeField.js';

const BASE = 'lighting/diffuse-probes';
const HERE = 'tools/bake_lighting/diffuse_probes';
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const inputs = async ctx => [
    ...await listFiles(path.join(ctx.root, HERE)),
    ...await listFiles(path.join(ctx.root, 'tools/receiver_lightmaps/blender')),
    ...await listFiles(path.join(ctx.root, 'tools/illumination_bake_compiler/blender')),
    path.join(ctx.root, 'src/app/illumination/diffuse_probes/DiffuseProbeField.js')
].filter(v => /\.(mjs|py|json|js)$/.test(v));

async function validatePass(result) {
    const receipt = await json(result.receipt);
    const field = await hashFile(result.data);
    if (receipt.schema !== 'bus-sim-diffuse-probe-pass-v1' || receipt.pass !== result.pass
        || receipt.sha256 !== field.sha256 || receipt.bytes !== field.bytes
        || receipt.jobSha256 !== (await hashFile(path.join(result.prepared, 'job.json'))).sha256
        || receipt.sceneSha256 !== (await hashFile(path.join(result.prepared, 'probes.blend'))).sha256) throw new Error('Diffuse probe pass authentication failed');
}

async function validatePublication(result) {
    const field = await json(result.index);
    const bytes = await readFile(result.data);
    if ((await hashFile(result.data)).sha256 !== field.sha256) throw new Error('Diffuse probe hash mismatch');
    validateDiffuseProbeField(field, new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
}

const prepare = {
    id: BASE + '/prepare', dependencies: [BASE + '/validate', 'lighting/source'], blender: true, inputs,
    description: 'Build spatial irradiance receivers and visibility in the current static city', outputs: [BASE + '/prepare/scene'],
    options: { samples: bakeOption.samples, device: bakeOption.device }, defaults: { samples: 256, device: 'CPU' },
    async run(ctx) {
        const source = ctx.result('lighting/source').source;
        await copyFile(source, path.join(ctx.stage, 'source.bsib'));
        const parsed = await parseBakeSourcePackage(await readFile(source));
        const profile = { ...await json(path.join(ctx.root, HERE, 'defaults.json')), ...ctx.options };
        const job = { packageSha256: (await hashFile(source)).sha256, archiveSha256: ctx.toolchain.archiveSha256,
            executableSha256: ctx.toolchain.executableSha256, profile, sourceHash: parsed.manifest.hashes.resolvedSource,
            sourceProfiles: parsed.manifest.lightingProfiles, cityId: parsed.manifest.source.cityId };
        await writeJson(path.join(ctx.stage, 'job.json'), job);
        await runHeadlessBake(ctx, HERE + '/blender/prepare.py', [ctx.stage]);
        return { state: 'validated', stage: ctx.stage, files: (await listFiles(ctx.stage)).filter(v => !/\.log$/.test(v)) };
    }
};

const pass = name => ({
    id: BASE + '/' + name, dependencies: [prepare.id], blender: true, inputs,
    description: name === 'sky' ? 'Bake occluded sky irradiance at spatial probes' : 'Bake diffuse bounce at spatial probes', outputs: [BASE + '/' + name + '/irradiance'],
    async run(ctx) {
        const prepared = ctx.result(prepare.id).stage;
        await runHeadlessBake(ctx, HERE + '/blender/bake.py', [ctx.stage, prepared, name]);
        return { state: 'validated', prepared, pass: name, data: path.join(ctx.stage, name + '.f32'),
            receipt: path.join(ctx.stage, 'receipt.json'), files: [path.join(ctx.stage, name + '.f32'), path.join(ctx.stage, 'receipt.json')] };
    }, validate: validatePass
});

const consolidate = {
    id: BASE, dependencies: [prepare.id], children: [BASE + '/sky', BASE + '/bounce'], inputs,
    description: 'Consolidate authenticated sky/bounce probe field and optionally publish', outputs: [BASE + '/publication'],
    async run(ctx) {
        const prepared = ctx.result(prepare.id).stage;
        const layout = await json(path.join(prepared, 'layout.json')), job = await json(path.join(prepared, 'job.json'));
        const visibility = await readFile(path.join(prepared, 'visibility.f32'));
        const data = new Float32Array(visibility.buffer.slice(visibility.byteOffset, visibility.byteOffset + visibility.length));
        const receipts = [];
        for (const name of ['sky', 'bounce']) {
            const result = ctx.result(BASE + '/' + name); await validatePass(result);
            receipts.push(await json(result.receipt));
            const bytes = await readFile(result.data);
            const values = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
            if (values.length !== layout.count * 18) throw new Error('Incomplete diffuse probe pass');
            for (let p = 0; p < layout.count; p++) for (let face = 0; face < 6; face++) for (let c = 0; c < 3; c++) data[(p * DIFFUSE_PROBE_WIDTH + face) * 4 + c] += values[p * 18 + face * 3 + c];
        }
        const dataPath = path.join(ctx.stage, 'field.f32');
        await writeFile(dataPath, new Uint8Array(data.buffer));
        const hash = await hashFile(dataPath);
        const index = { schema: DIFFUSE_PROBE_SCHEMA, representation: 'ambient-cube-irradiance-oct-depth-v1',
            ...Object.fromEntries(['regions','count','width','depthSize','maxDistance','validCount'].map(key => [key, layout[key]])),
            ...hash, sourceHash: job.sourceHash, sourceProfiles: job.sourceProfiles, cityId: job.cityId,
            profile: job.profile, signature: layout.signature, passes: receipts,
            url: 'field.f32', compilerIdentity: ctx.key };
        const indexPath = path.join(ctx.stage, 'index.json');
        await writeJson(indexPath, index);
        const result = { state: 'validated', index: indexPath, data: dataPath, files: [indexPath, dataPath] };
        await validatePublication(result); await ctx.assertInputsStable();
        if (ctx.publish) {
            const destination = path.join(ctx.root, 'assets/baked_lighting/diffuse_probes');
            const identity = digest(index), folder = path.join(destination, identity);
            await mkdir(folder, { recursive: true });
            await publishBakeFile(dataPath, path.join(folder, 'field.f32'));
            await publishBakeFile(indexPath, path.join(folder, 'index.json'));
            const live = path.join(ctx.stage, 'live-index.json');
            await writeJson(live, { ...index, url: identity + '/field.f32' });
            await publishBakeFile(live, path.join(destination, 'index.json'));
            result.state = 'published';
            result.files.push(path.join(destination, 'index.json'), path.join(folder, 'field.f32'), path.join(folder, 'index.json'));
        }
        return result;
    }, validate: validatePublication
};

const calibration = {
    id: BASE + '/validate', blender: true, inputs, outputs: [BASE + '/calibration'],
    description: 'Calibrate virtual receiver visibility, irradiance units and packed-image persistence',
    async run(ctx) {
        await writeJson(path.join(ctx.stage, 'job.json'), { archiveSha256: ctx.toolchain.archiveSha256 });
        await runHeadlessBake(ctx, HERE + '/blender/validate.py', [ctx.stage]);
        return { state: 'validated', files: [path.join(ctx.stage, 'calibration.json'), path.join(ctx.stage, 'calibration.blend')] };
    }
};
export const diffuseProbeJobs = [calibration, prepare, pass('sky'), pass('bounce'), consolidate];
