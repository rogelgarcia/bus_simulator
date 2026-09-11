// Install only a validated candidate already exercised in the actual calibrated game.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { candidateInputs } from './CandidateInputs.mjs';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { outputPath } from './Baseline.mjs';
import { hashFile, writeJson } from '../../../baking/Files.mjs';
import { publishProductionPackageIndex } from '../../../static_sun_depth/src/ProductionOrchestrator.mjs';
import { RECEIVER_ALPHA_TRANSPORT } from '../../../../src/app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';

const read = async file => JSON.parse(await readFile(file, 'utf8'));

export async function install(ctx) {
    if (!ctx.publish || !ctx.options.capture || !ctx.options.native || !ctx.options['candidate-run'] || !ctx.options.output)
        throw new Error('Installation requires --publish, candidate-run, validated capture, native validation and a new output');
    const candidate = await candidateInputs(ctx, ctx.options['candidate-run']);
    if ((await read(candidate.receiverIndex)).mapping.profile.transportPolicy !== RECEIVER_ALPHA_TRANSPORT)
        throw new Error('Installation requires the corrected UV and raw-texture transport bake');
    const capture = outputPath(ctx.root, ctx.options.capture), native = outputPath(ctx.root, ctx.options.native);
    await authenticated(path.join(capture, 'capture_receipt.json'));
    await authenticated(path.join(native, 'native_receipt.json'));
    const prepared = await read(path.join(capture, 'prepared.json'));
    for (const file of candidate.files) {
        if (!prepared.bakes.files.some(item => item.file === file.file && item.sha256 === file.sha256))
            throw new Error('Candidate differs from the actual tested capture');
    }
    const manifest = await read((await read(path.join(capture, 'manifest.json'))).baselineManifest);
    if (manifest.status !== 'validated' || manifest.images.length !== 5 || !manifest.images.every(image =>
        image.atmosphere.sun.elevationDeg === 55 && image.baked.status.effectiveMode === 'baked'
        && image.baked.receiverLightmaps.effective.indirect && image.baked.receiverLightmaps.activationBlend === 1))
        throw new Error('Five fully applied calibrated game captures are required');
    const checks = await read(path.join(native, 'validation.json'));
    if (!checks.checks.length || !checks.checks.every(check => check.passed)) throw new Error('Native calibration failed');
    const transitions = await read(path.join(capture, 'transitions/transitions.json'));
    if (transitions.worldDropouts.length || !transitions.steadyPrograms || !transitions.steadyTextures || !transitions.steadyGeometries)
        throw new Error('Actual lighting transitions failed');
    if (!transitions.rounds.every(round => Number.isFinite(round.maximumFrameMs) && round.maximumFrameMs <= 2000))
        throw new Error('Lighting transitions require measured main-thread responsiveness');
    const output = outputPath(ctx.root, ctx.options.output); await mkdir(path.dirname(output), {recursive:true}); await mkdir(output);
    const shadowIndex = path.join(ctx.root, 'assets/baked_lighting/shadows/package_index.json');
    const receiverIndex = path.join(ctx.root, 'assets/baked_lighting/receivers/enhanced/package_index.json');
    const previousShadows = await read(shadowIndex), nextShadows = await read(candidate.shadowIndex);
    await writeJson(path.join(output, 'previous-indexes.json'), {shadows:previousShadows,receivers:await read(receiverIndex)});
    // The maintained receiver publisher authenticates coverage, shards and channels
    // and switches its index last. Existing development-cache semantics are retained;
    // this is not the separate exact-eight aggregate release certification.
    await ctx.node('tools/receiver_lightmaps/publish.mjs', ['--enhanced', '--from', path.dirname(path.dirname(candidate.receiverIndex))]);
    await publishProductionPackageIndex(shadowIndex, {...previousShadows,profiles:{...previousShadows.profiles,...nextShadows.profiles}});
    await writeJson(path.join(output, 'installed.json'), {candidate:candidate.files,capture,native,
        shadowIndex:await hashFile(shadowIndex),receiverIndex:await hashFile(receiverIndex),
        policy:'Validated development cache; historical aggregate release certificate remains separate'});
    const file = path.join(output, 'install_receipt.json');
    return resultFiles(await receipt(file, ctx.key, {output}, [path.join(output,'previous-indexes.json'),path.join(output,'installed.json')]), file);
}
