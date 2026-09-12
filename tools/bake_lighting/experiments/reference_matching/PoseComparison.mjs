// Capture one exact gameplay pose and its Cycles reference without publishing or building a gallery.
import path from 'node:path';
import {mkdir, readFile, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {sanitizeGameplayPose} from '../../../../src/app/gameplay/GameplayPose.js';
import {sourceFiles, snapshotFiles, baselineInputs} from '../lighting_configurations/Inputs.mjs';
import {captureBaselines} from '../lighting_configurations/capture_baselines/CaptureBaselines.mjs';
import {authenticated, receipt, resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {digest, writeJson, listFiles, hashFile} from '../../../baking/Files.mjs';
import {outputPath} from './Baseline.mjs';
import {reference} from './Reference.mjs';

export async function poseComparison(ctx) {
    if (ctx.publish || !ctx.options.pose || !ctx.options.output || !ctx.options['source-run']) {
        throw new Error('pose, output and source-run are required; diagnostic comparisons cannot publish');
    }
    const poseFile = path.resolve(ctx.root, ctx.options.pose);
    const supplied = JSON.parse(await readFile(poseFile, 'utf8'));
    const pose = sanitizeGameplayPose({...supplied, hud: {visible: false}});
    if (pose.city !== 'bigcity2' || pose.bus?.modelId !== 'city' || !pose.bus.transform
        || !pose.camera?.position || !pose.camera.quaternion || !pose.camera.locked
        || !pose.camera.fovDeg || !pose.simulation?.paused) throw new Error('An exact paused, locked BigCity2 City Bus pose is required');
    await authenticated(path.resolve(ctx.root, ctx.options['source-run'], 'afternoon_receipt.json'));
    const started = Date.now();
    const output = outputPath(ctx.root, ctx.options.output);
    await mkdir(path.dirname(output), {recursive: true});
    await mkdir(output);
    await copyFile(poseFile, path.join(output, 'requested_pose.json'));
    const runRoot = path.join(output, 'game');
    await mkdir(runRoot);
    const baseline = {
        id: 'game_defaults', expectedMode: 'baked', expectedSunProfile: 'ai527.sun.az045.el55',
        readinessTimeoutSeconds: 240, settleFrames: 60, storage: {},
        settingsPolicy: 'Current repository defaults in a fresh browser; all installed baked channels must finish applying. Personal preferences are not imported.'
    };
    const source = await snapshotFiles(ctx.root, await sourceFiles(ctx.root));
    const run = {
        schemaVersion: 1, experimentId: 'single_pose_comparison', runId: path.basename(output), runRoot,
        baseline, poses: [{id: 'pose_custom', busId: 'bus_custom', pose}], viewport: {width: 1920, height: 1080},
        source: {files: source, sha256: digest(source)}, bakes: await baselineInputs(ctx.root, baseline),
        configuration: [], engineRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ctx.root, encoding: 'utf8'}).trim(),
        startedAt: new Date(started).toISOString()
    };
    const prepared = path.join(runRoot, 'prepared.json');
    await writeJson(prepared, run);
    const game = await captureBaselines(ctx, run);
    await receipt(path.join(runRoot, 'capture_receipt.json'), ctx.key, {runRoot, diagnosticOnly: true}, [...game.files, prepared]);
    const cycles = await reference({...ctx, options: {capture: runRoot, output: path.join(output, 'cycles'),
        'source-run': ctx.options['source-run'], mode: 'background', quality: 'pilot'}});
    const renders = JSON.parse(await readFile(path.join(output, 'cycles', 'renders.json'), 'utf8'));
    await copyFile(path.join(runRoot, 'runtime', baseline.id, '1920x1080', 'pose_custom.png'), path.join(output, 'game.png'));
    await copyFile(renders[0].image, path.join(output, 'cycles.png'));
    const manifest = path.join(output, 'comparison_receipt.json');
    return resultFiles(await receipt(manifest, ctx.key, {
        diagnosticOnly: true, publicationEligible: false, sourcePose: {file: poseFile, ...await hashFile(poseFile)},
        gameManifest: game.manifest, referenceManifest: cycles.manifest, seconds: (Date.now() - started) / 1000
    }, await listFiles(output)), manifest);
}
