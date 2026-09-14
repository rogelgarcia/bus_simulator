// @ts-check
// Isolate material response using the authenticated five-pose controls and saved Cycles lobes.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { sourceFiles, snapshotFiles, baselineInputs } from '../lighting_configurations/Inputs.mjs';
import { captureBaselines } from '../lighting_configurations/capture_baselines/CaptureBaselines.mjs';
import { readGameEvidence, settleGameFrames } from '../lighting_configurations/capture_baselines/GameEvidence.mjs';
import { withGameBrowser } from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import { writeJson, digest, listFiles } from '../../../baking/Files.mjs';
import { rawRadiance } from './RawRadiance.mjs';
import { TOOL, outputPath } from './Baseline.mjs';

const read = async file => JSON.parse(await readFile(file, 'utf8'));
const comparable = value => JSON.stringify(value).replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://localhost');

function assertControls(actual, expected, pose, comparePose = true) {
    const keys=['viewport', 'lighting', 'atmosphere', 'graphics', 'sourceHashes'];
    if(comparePose)keys.push('actualPose','projectionMatrix');
    for (const key of keys) {
        if (comparable(actual[key]) !== comparable(expected[key])) throw new Error(`${pose}: changed ${key}`);
    }
    if (actual.baked.status.effectiveMode !== 'baked' || actual.baked.receiverLightmaps.activationBlend !== 1
        || !actual.baked.receiverLightmaps.effective.indirect || actual.baked.status.profileId !== expected.baked.status.profileId) {
        throw new Error(`${pose}: bake not fully applied or changed`);
    }
}

export async function materialParityCapture(ctx) {
    if (ctx.publish || !['capture', 'control', 'output'].every(key => ctx.options[key])) throw new Error('capture, control, new output required; diagnostic only');
    const capture = outputPath(ctx.root, ctx.options.capture), control = outputPath(ctx.root, ctx.options.control);
    await authenticated(path.join(capture, 'capture_receipt.json'));
    await authenticated(path.join(control, 'bake_progress_receipt.json'));
    const original = await read(path.join(capture, 'prepared.json')), previous = await read(path.join(control, 'request.json'));
    const output = outputPath(ctx.root, ctx.options.output), started = Date.now();
    await mkdir(output);
    const baseline = structuredClone(original.baseline);
    baseline.id = path.basename(output);
    baseline.storage['bus_sim.buildingWindowVisuals.v1'] = { ...baseline.storage['bus_sim.buildingWindowVisuals.v1'], surfaces: { reflections: true } };
    baseline.settingsPolicy = 'AI568: fixed v7 light/display controls; opaque reflections On; texture AO bypassed only during diagnostic renders.';
    const source = await snapshotFiles(ctx.root, await sourceFiles(ctx.root));
    const allPoses = ['source','resolved'].includes(ctx.options.phase);
    const prepared = { ...original, runId: baseline.id, runRoot: output, baseline,
        poses: original.poses.filter(pose => allPoses || ['pose_02', 'pose_03'].includes(pose.id)),
        source: { files: source, sha256: digest(source) }, bakes: await baselineInputs(ctx.root, baseline),
        engineRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ctx.root, encoding: 'utf8' }).trim(),
        startedAt: new Date(started).toISOString() };
    if (prepared.poses.length !== (allPoses ? 5 : 2)) throw new Error('Required control poses missing');
    if(ctx.options.pose)prepared.poses.push({id:'pose_custom',busId:'bus_custom',pose:await read(path.resolve(ctx.root,ctx.options.pose))});
    await writeJson(path.join(output, 'prepared.json'), prepared);
    await writeJson(path.join(output, 'request.json'), { capture, control, poses: prepared.poses, reference: previous.reference });
    await captureBaselines(ctx, prepared, { collectMetrics: async (page, item) => {
        await page.waitForFunction(() => {
            const detail = window.__busSim.engine._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows;
            return detail.state === 'off' || (detail.state === 'ready' && detail.pending === 0 && detail.queued === 0 && detail.selectionFallbacks === 0);
        }, null, { timeout: 60000 });
        await page.evaluate(settleGameFrames, 60);
        const samePose=previous.poses.find(pose => pose.id === item.id);
        const expected = (samePose??previous.poses[0]).records[previous.sources.findIndex(source => source.role === 'current')];
        const before = await page.evaluate(readGameEvidence);
        // captureBaselines independently validates the requested custom pose,
        // projection dimensions and bus placement. Lighting stays on this control.
        assertControls(before, expected, item.id,!!samePose);
        const selected = await page.evaluate(async () => {
            const { applyBuildingSurfaceReflections } = await import('/src/graphics/visuals/buildings/BuildingSurfaceReflections.js');
            const { engine, sm } = window.__busSim;
            return applyBuildingSurfaceReflections(sm.current.city.buildings.group, true, engine.lightingSettings.ibl.envMapIntensity);
        });
        if (!selected.materials) throw new Error('No opaque reflection materials');
        // A paused simulation still runs renderer/streaming updates. Freeze the
        // engine between raw passes so changing shadow state cannot mimic AO.
        const frozen = await page.evaluate(() => {
            const engine = window.__busSim.engine;
            const state = { running: engine._running, frame: engine.frameIndex,
                shadows: engine._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows };
            engine.stop(); return state;
        });
        try {
            await rawRadiance(page, path.join(output, item.id), { materialDiagnostics: true, materialParity: true,
                reflectionParity: ctx.options.phase === 'reflections', sourceParity: ctx.options.phase === 'source', resolvedParity: ctx.options.phase === 'resolved' });
            if (await page.evaluate(() => window.__busSim.engine.frameIndex) !== frozen.frame) throw new Error('Engine advanced during material snapshot');
        } finally {
            if (frozen.running) await page.evaluate(() => window.__busSim.engine.start());
        }
        await page.evaluate(settleGameFrames, 12);
        const after = await page.evaluate(readGameEvidence);
        assertControls(after, before, item.id);
        if (comparable(before.savedSettings) !== comparable(after.savedSettings)) throw new Error('Diagnostic changed saved settings');
        await writeJson(path.join(output, item.id, 'evidence.json'), { before, after, selected, frozen });
        ctx.log.line(ctx.id, `${item.id}: raw AO/diffuse/albedo passes captured; controls restored`);
        return { diagnostic: true, timedBenchmark: false };
    } });
    const file = path.join(output, 'material_parity_capture_receipt.json');
    return resultFiles(await receipt(file, ctx.key, { output, diagnosticOnly: true, seconds: (Date.now() - started) / 1000 }, await listFiles(output)), file);
}

export async function materialParityAnalysis(ctx) {
    if (ctx.publish || !ctx.options.capture || !ctx.options.output) throw new Error('capture and new output required; diagnostic only');
    const capture = outputPath(ctx.root, ctx.options.capture);
    await authenticated(path.join(capture, 'material_parity_capture_receipt.json'));
    const request = await read(path.join(capture, 'request.json'));
    await authenticated(path.join(request.control, 'bake_progress_receipt.json'));
    await authenticated(path.join(request.reference, 'reference_receipt.json'));
    const control = await read(path.join(request.control, 'request.json'));
    for (const item of request.poses) {
        const { before, after, frozen } = await read(path.join(capture, item.id, 'evidence.json'));
        if (!frozen || !Number.isSafeInteger(frozen.frame)) throw new Error('Raw snapshot lacks frozen engine-frame evidence');
        assertControls(after, before, item.id);
        assertControls(before, control.poses.find(pose => pose.id === item.id).records[control.sources.findIndex(source => source.role === 'current')], item.id);
    }
    const output = outputPath(ctx.root, ctx.options.output);
    await mkdir(output);
    await writeJson(path.join(output, 'request.json'), { ...request, capture });
    const metadata=await read(path.join(capture,request.poses[0].id,'metadata.json'));
    const sourceParity=metadata.passes.includes('source_combined_no_material_ao');
    await ctx.process(ctx.config.pythonExecutable, [path.join(ctx.root, TOOL, sourceParity ? 'source_material_analysis.py' : 'material_parity_analysis.py'), output]);
    await withGameBrowser(ctx, { width: 1600, height: 500 }, async page => {
        for (const sheet of await read(path.join(output, 'sheets.json'))) {
            const images = await Promise.all(sheet.panels.map(async panel => ({ ...panel, src: 'data:image/png;base64,' + (await readFile(panel.file)).toString('base64') })));
            await page.setViewportSize({ width: sheet.width, height: sheet.height });
            const width = sheet.width / images.length;
            await page.setContent(`<html><body style="margin:0;background:#101921;color:#d8e0e7;font:16px Arial;display:flex">${images.map(image => `<section style="width:${width}px"><header style="height:48px;padding:8px;box-sizing:border-box">${image.label}</header><img style="display:block;width:${width}px" src="${image.src}"></section>`).join('')}</body></html>`);
            await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
            await page.screenshot({ path: sheet.file });
        }
    });
    const file = path.join(output, 'material_parity_analysis_receipt.json');
    return resultFiles(await receipt(file, ctx.key, { output, diagnosticOnly: true }, await listFiles(output)), file);
}
