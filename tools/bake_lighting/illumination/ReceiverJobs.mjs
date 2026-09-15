// Adapts existing receiver atlas, independent Cycles passes and authenticated packaging.
// @ts-check
import path from 'node:path';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { bakeOption } from '../../baking/Options.mjs';
import { listFiles, writeJson, hashFile } from '../../baking/Files.mjs';
import { runHeadlessBake } from '../../baking/Blender.mjs';
import { parseBakeSourcePackage } from '../../../src/app/illumination/bake_source/index.js';
import { resolveSharedSunProfile } from './SharedSunReference.mjs';

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const BASE = 'lighting/illumination';
const scripts = async ctx => (await listFiles(path.join(ctx.root, 'tools/receiver_lightmaps'))).filter(file => /\.(mjs|py)$/.test(file))
    .concat((await listFiles(path.join(ctx.root, 'tools/illumination_bake_compiler/blender'))).filter(file => file.endsWith('.py')),
        (await listFiles(path.join(ctx.root, 'src/app/illumination'))).filter(file => file.endsWith('.js')));

function argumentsFor(ctx, preparation, output) {
    return ['--input', preparation.source, '--output', output, '--samples', preparation.samples,
        '--blender', ctx.config.executable, '--installed', 'true',
        ...(preparation.enhanced ? ['--enhanced', 'true', '--layout', preparation.layout, '--device', preparation.device,
            '--texel-size', preparation['texel-size'], '--facade-detail', preparation['facade-detail'] ?? 'off', '--pages', preparation['texel-size'] === '0.5' ? '9' : '11'] : [])];
}

async function copyPreparation(prepared, stage) {
    await mkdir(stage, { recursive: true });
    for (const name of prepared.names) await copyFile(path.join(prepared.stage, name), path.join(stage, name));
}

/** Validates independently usable offline sky or bounce maps before consolidation. */
export async function validateReceiverPass(result) {
    const receipt = await readJson(path.join(result.stage, `${result.pass}.receipt.json`));
    const job = await hashFile(path.join(result.stage, 'job.json'));
    const atlas = await readJson(path.join(result.stage, 'atlas.json'));
    if (receipt.schema !== 'bus-sim-independent-receiver-pass-v1' || receipt.pass !== result.pass || receipt.jobSha256 !== job.sha256
        || receipt.files.length !== atlas.pageCount) throw new Error('Receiver pass identity or page count mismatch');
    if (receipt.atlasSha256 !== (await hashFile(path.join(result.stage, 'atlas.json'))).sha256
        || receipt.chartSha256 !== (atlas.chartFile ? (await hashFile(path.join(result.stage, atlas.chartFile))).sha256 : null)) throw new Error('Receiver pass atlas or settings mismatch');
    for (let page = 0; page < atlas.pageCount; page++) {
        const entry = receipt.files[page];
        if (entry.file !== `${result.pass}.${page}.npy`) throw new Error('Invalid receiver pass page');
        const actual = await hashFile(path.join(result.stage, entry.file));
        if (entry.sha256 !== actual.sha256 || entry.bytes !== actual.bytes) throw new Error(`Receiver pass hash mismatch: ${entry.file}`);
    }
}

/** Creates a separately callable receiver pipeline without duplicating the baker. */
export function receiverJobs(enhanced) {
    const base = enhanced ? BASE : `${BASE}/preview`;
    const prepareId = `${base}/prepare`;
    const occlusionId = enhanced ? 'lighting/occlusion' : 'lighting/occlusion/preview';
    const directId = `${base}/direct`;
    const bounceId = `${base}/indirect`;
    const prepare = {
        id: prepareId, dependencies: ['lighting/source'], blender: true,
        outputs: [`${base}/atlas`], inputs: scripts,
        description: enhanced ? 'Complete opaque receiver UV layout and atlas' : 'Original scalar preview atlas',
        options: { samples: bakeOption.samples, ...(enhanced ? { device: bakeOption.device, 'texel-size': bakeOption.choice(['0.5', '0.33', '0.25']), 'facade-detail': bakeOption.choice(['off','8cm']) } : {}) },
        defaults: { samples: enhanced ? 896 : 64, ...(enhanced ? { device: 'CPU', 'texel-size': '0.5', 'facade-detail': 'off' } : {}) },
        async run(ctx) {
            const source = ctx.result('lighting/source').source;
            let layout;
            if (enhanced) {
                const unwrap = path.join(ctx.stage, 'unwrap');
                await ctx.node('tools/receiver_lightmaps/unwrap.mjs', [source, unwrap, ctx.config.executable]);
                layout = path.join(unwrap, 'receiver-layout.json');
            }
            const result = { source, layout, enhanced, ...ctx.options };
            const output = path.join(ctx.stage, 'atlas');
            await ctx.node('tools/receiver_lightmaps/run.mjs', [...argumentsFor(ctx, result, output), '--prepare-only', 'true']);
            const prepared = await readJson(path.join(output, 'prepared.json'));
            const names = ['source.bsib', 'job.json', 'atlas.json', ...(enhanced ? ['charts.ndjson'] : [])];
            return { ...result, stage: prepared.stage, names, state: 'validated',
                files: names.map(name => path.join(prepared.stage, name)).concat(layout ? [layout] : []) };
        }
    };
    const makePass = (id, pass, description) => ({
        id, description, dependencies: [prepareId], blender: true, inputs: scripts, outputs: [`${base}/${pass}.npy`],
        async run(ctx) {
            const prepared = ctx.result(prepareId);
            await copyPreparation(prepared, ctx.stage);
            await runHeadlessBake(ctx, `tools/receiver_lightmaps/blender/${enhanced ? 'bake_surface' : 'bake'}.py`, [ctx.stage, '--pass', pass]);
            const receipt = await readJson(path.join(ctx.stage, `${pass}.receipt.json`));
            return { state: 'validated', stage: ctx.stage, pass, files: [path.join(ctx.stage, 'job.json'), path.join(ctx.stage, 'atlas.json'),
                ...enhanced ? [path.join(ctx.stage, 'charts.ndjson')] : [],
                path.join(ctx.stage, `${pass}.receipt.json`), ...receipt.files.map(v => path.join(ctx.stage, v.file))] };
        }, validate: validateReceiverPass
    });
    const direct = enhanced ? {
        id: directId, description: 'Declare shared sun visibility; no duplicate direct Cycles bake',
        dependencies: [prepareId, 'lighting/shadows'], outputs: [`${base}/direct-reference.json`],
        async run(ctx) {
            const file = path.join(ctx.stage, 'direct-reference.json');
            const source = await parseBakeSourcePackage(await readFile(ctx.result(prepareId).source));
            const shadows = ctx.result('lighting/shadows').index;
            const lightingProfileId = resolveSharedSunProfile(source.manifest.lightingProfiles, await readJson(shadows));
            await writeJson(file, { representation: 'hybrid-sun-visibility-v1', shadows: ctx.result('lighting/shadows').index,
                lightingProfileId,
                receiverJob: await hashFile(path.join(ctx.result(prepareId).stage, 'job.json')) });
            return { state: 'validated', files: [file], reference: file };
        }
    } : makePass(directId, 'direct_receiver', 'Original preview direct sunlight bake');
    const parent = {
        id: base, description: enhanced ? 'Consolidate enhanced sky + bounce with shared sun visibility' : 'Consolidate original preview direct + sky + bounce',
        children: [directId, bounceId, occlusionId], dependencies: [prepareId], inputs: scripts, blender: true,
        outputs: [`${base}/packages`],
        async run(ctx) {
            const prepared = ctx.result(prepareId);
            const output = path.join(ctx.stage, 'bake');
            const stage = path.join(output, 'consolidating.partial');
            await copyPreparation(prepared, stage);
            for (const id of [bounceId, occlusionId, ...enhanced ? [] : [directId]]) {
                const result = ctx.result(id);
                for (const file of result.files.filter(file => /\.npy$|\.receipt\.json$/.test(file))) await copyFile(file, path.join(stage, path.basename(file)));
            }
            await runHeadlessBake(ctx, 'tools/receiver_lightmaps/blender/consolidate_passes.py', [stage]);
            await ctx.node('tools/receiver_lightmaps/run.mjs', [...argumentsFor(ctx, prepared, output), '--resume', stage]);
            await ctx.assertInputsStable();
            await ctx.node('tools/receiver_lightmaps/publish.mjs', [...enhanced ? ['--enhanced'] : [], '--from', output, ...ctx.publish ? [] : ['--validate-only']]);
            const latest = await readJson(path.join(output, 'latest.json'));
            const folder = path.join(output, latest.directory);
            const files = (await listFiles(folder)).filter(file => /\.ilpkg\.gz$|package_index\.json$|metrics\.json$/.test(file));
            if (ctx.publish) {
                const destination = path.join(ctx.root, 'assets/baked_lighting/receivers', enhanced ? 'enhanced' : '');
                files.push(path.join(destination, 'package_index.json'), ...await listFiles(path.join(destination, latest.directory)));
            }
            return { state: ctx.publish ? 'published' : 'validated', output, folder,
                files };
        }
    };
    return [prepare, direct, makePass(bounceId, 'bounce', 'Bake indirect diffuse bounce from the complete participating scene'),
        makePass(occlusionId, 'sky', 'Bake occluded sky irradiance; consumed by receiver indirect lighting'), parent]
        .map(job=>({...job,codePaths:['tools/bake_lighting/illumination']}));
}
