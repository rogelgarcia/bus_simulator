// Wraps certified static sun depth and its native alpha-cutout preparation.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { selectProductionStaticSunProfiles } from '../../static_sun_depth/src/ProductionOrchestrator.mjs';
import { bakeOption } from '../../baking/Options.mjs';
import { listFiles, writeJson } from '../../baking/Files.mjs';

const ids = selectProductionStaticSunProfiles().map(v => v.id);
const settings = { defaults: { profile: 'all' }, options: { profile: bakeOption.choice(['all', ...ids]) } };
const selected = options => options.profile === 'all' ? ids : [options.profile];
const nativeRoot = ctx => path.join(ctx.root, 'tests/artifacts/illumination_531/ai556',
    `${ctx.id.split('/').at(-1)}-${Date.now()}-${process.pid}`);
const machineArguments = ctx => ['--input', ctx.result('lighting/source').source,
    '--blender', ctx.config.executable, '--archive', ctx.config.archive];
const artifactFiles = async root => (await listFiles(root)).filter(file => !file.includes('.candidate_blender_stage')
    && !file.includes(`${path.sep}.staging${path.sep}`) && !file.endsWith('.log'));
async function inputs(ctx) {
    return [...await listFiles(path.join(ctx.root, 'tools/static_sun_depth')),
        ...await listFiles(path.join(ctx.root, 'tools/illumination_bake_compiler'))].filter(file => /\.(mjs|py|json)$/.test(file));
}
export const shadowJobs = [{
    id: 'lighting/shadows/candidates', description: 'Authenticated Blender candidate lattice for native foliage capture',
    dependencies: ['lighting/source'], blender: true, archive: true, ...settings, inputs,
    outputs: ['shadows/candidate-lattices'],
    async run(ctx) {
        const native = nativeRoot(ctx);
        for (const profile of selected(ctx.options)) {
            ctx.log.line(ctx.id, `Preparing ${profile}`);
            await ctx.node('tools/static_sun_depth/build_alpha_cutout_texture_grad_field.mjs', ['--input', ctx.result('lighting/source').source,
                '--profile-id', profile, '--output-root', path.join(native, profile), '--blender', ctx.config.executable, '--archive', ctx.config.archive, '--candidate-only']);
        }
        return { state: 'validated', native, files: await artifactFiles(native) };
    }
}, {
    id: 'lighting/shadows/cutouts', description: 'Capture source-derived direct Depth24 foliage fields using the maintained native pipeline',
    dependencies: ['lighting/source', 'lighting/shadows/candidates'], blender: true, archive: true, ...settings, inputs,
    outputs: ['shadows/native-cutout-fields'],
    async run(ctx) {
        const native = nativeRoot(ctx);
        for (const profile of selected(ctx.options)) {
            await ctx.node('tools/static_sun_depth/capture_alpha_cutout_native_field.mjs', [...machineArguments(ctx),
                '--profile-id', profile, '--candidate-root', path.join(ctx.result('lighting/shadows/candidates').native, profile, 'candidates'),
                '--output-root', path.join(native, profile)]);
        }
        return { state: 'validated', native, files: await artifactFiles(native) };
    }
}, {
    id: 'lighting/shadows/provisional', description: 'Compose native cutouts with opaque depth for parity validation',
    dependencies: ['lighting/source', 'lighting/shadows/cutouts'], blender: true, archive: true, ...settings, inputs,
    outputs: ['shadows/provisional-depth'],
    async run(ctx) {
        const output = nativeRoot(ctx);
        for (const profile of selected(ctx.options)) {
            await ctx.node('tools/static_sun_depth/render_native_cutout_provisional.mjs', [...machineArguments(ctx),
                '--native-cutout-root', ctx.result('lighting/shadows/cutouts').native,
                '--output-root', output, '--profile-id', profile]);
        }
        return { state: 'validated', output, files: await artifactFiles(output) };
    }
}, {
    id: 'lighting/shadows/parity', description: 'Authenticate native foliage parity against the live reference',
    dependencies: ['lighting/source', 'lighting/shadows/cutouts', 'lighting/shadows/provisional'],
    blender: true, archive: true, ...settings, inputs, outputs: ['shadows/native-parity'],
    async run(ctx) {
        const output = nativeRoot(ctx);
        for (const profile of selected(ctx.options)) {
            await ctx.node('tools/static_sun_depth/build_alpha_cutout_native_field_parity.mjs', [...machineArguments(ctx),
                '--native-cutout-root', ctx.result('lighting/shadows/cutouts').native,
                '--production-root', ctx.result('lighting/shadows/provisional').output,
                '--output-root', path.join(output, profile), '--profile-id', profile]);
        }
        return { state: 'validated', output, files: await artifactFiles(output) };
    }
}, {
    id: 'lighting/shadows', description: 'Production static sun depth; fixed resolution, one sample, CPU; candidate publication only',
    dependencies: ['lighting/source', 'lighting/shadows/cutouts', 'lighting/shadows/parity'], blender: true, archive: true, ...settings, inputs,
    outputs: ['shadows/production-packages'],
    async run(ctx) {
        // AI531 authenticates repository-relative asset URLs. Its candidate gets a
        // new asset namespace; the live root index is never switched by this job.
        const output = path.join(ctx.root, 'assets/baked_lighting/shadows/framework', `${ctx.key}-${Date.now()}`);
        const request = path.join(ctx.stage, 'request.json');
        await writeJson(request, { inputPath: ctx.result('lighting/source').source, executablePath: ctx.config.executable,
            archivePath: ctx.config.archive, nativeCutoutRoot: ctx.result('lighting/shadows/cutouts').native,
            alphaParityRoot: ctx.result('lighting/shadows/parity').output,
            artifactRoot: output, profiles: selected(ctx.options), resultPath: path.join(ctx.stage, 'result.json') });
        await ctx.node('tools/bake_lighting/shadows/worker.mjs', [request]);
        const index = path.join(output, 'package_index.json');
        const result = JSON.parse(await readFile(path.join(ctx.stage, 'result.json'), 'utf8'));
        ctx.log.line(ctx.id, 'Validated development candidate; strict AI531 release certification remains a separate gate. Live shadow index preserved.');
        return { state: 'validated', index, output, result, files: await listFiles(output) };
    }
}];
