// Compare authenticated previous/current bakes against one fixed five-pose reference.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { withGameBrowser } from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import { writeJson, listFiles, hashFile } from '../../../baking/Files.mjs';
import { outputPath, TOOL } from './Baseline.mjs';

const read = async file => JSON.parse(await readFile(file, 'utf8'));
const comparable = value => JSON.stringify(value).replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://localhost');

export async function bakeProgressReview(ctx) {
    if (ctx.publish || !['current', 'reference', 'output'].every(key => ctx.options[key])) {
        throw new Error('current, reference and new output required; previous is optional; diagnostic only');
    }
    const started = performance.now();
    const sources = [];
    for (const key of ['previous', 'current'].filter(key => ctx.options[key])) {
        const root = outputPath(ctx.root, ctx.options[key]);
        await authenticated(path.join(root, 'capture_receipt.json'));
        const manifest = await read(path.join(root, 'manifest.json'));
        sources.push({ role: key, root, prepared: await read(path.join(root, 'prepared.json')),
            manifest: await read(manifest.baselineManifest) });
    }
    const reference = outputPath(ctx.root, ctx.options.reference);
    await authenticated(path.join(reference, 'reference_receipt.json'));
    const request = await read(path.join(reference, 'request.json'));
    const renders = await read(path.join(reference, 'renders.json'));
    const poses = [];
    for (const id of ['pose_01', 'pose_02', 'pose_03', 'pose_04', 'pose_05']) {
        const records = sources.map(source => source.manifest.images.find(image => image.id === id));
        const target = renders.find(render => render.pose === id);
        if (records.some(record => !record) || !target) throw new Error(`Missing ${id}`);
        for (const key of ['requestedPose', 'actualPose', 'projectionMatrix', 'viewport', 'lighting', 'atmosphere', 'graphics', 'materials', 'sourceHashes', 'savedSettings']) {
            if (records.slice(1).some(record => comparable(records[0][key]) !== comparable(record[key]))) throw new Error(`${id}: ${key} differs between game captures`);
        }
        for (const [index, record] of records.entries()) {
            const pose = sources[index].prepared.poses.find(item => item.id === id);
            if (comparable(pose) !== comparable(request.poses.find(item => item.id === id))) throw new Error(`${id}: reference pose differs`);
            if (record.baked.status.effectiveMode !== 'baked' || record.baked.receiverLightmaps.activationBlend !== 1
                || !record.baked.receiverLightmaps.effective.indirect) throw new Error(`${id}: bake not fully applied`);
            if (Math.abs(record.lighting.exposure - 2 ** target.exposureEv) > 1e-8 || record.lighting.toneMapping !== 'aces'
                || record.graphics.colorGrading.preset !== 'off' || record.graphics.sunBloom.enabled
                || record.atmosphere.sun.elevationDeg !== 55 || target.grade !== 'off'
                || !target.tone.includes('ACESFilmic')) throw new Error(`${id}: unmatched display or light`);
        }
        const settings = records.map(record => ({ ...record.baked.settings, mode: 'baked' }));
        if (settings.slice(1).some(setting => comparable(settings[0]) !== comparable(setting))) throw new Error(`${id}: bake controls differ`);
        poses.push({ id, records, target });
    }
    const output = outputPath(ctx.root, ctx.options.output);
    await mkdir(output);
    const regionFile = path.join(ctx.root, TOOL, 'bake_progress_regions.json');
    const files = sources.map(source => new Map(source.prepared.source.files.map(file => [file.file, file.sha256])));
    const sourceChanges = files.length > 1 ? [...new Set([...files[0].keys(), ...files[1].keys()])].filter(file => files[0].get(file) !== files[1].get(file)) : [];
    await writeJson(path.join(output, 'request.json'), { output, reference, poses, sources,
        regions: await read(regionFile), regionIdentity: await hashFile(regionFile), sourceChanges,
        policy: 'Recorded controls and poses match; source revisions are retained separately. Display errors are not irradiance or photorealism scores.' });
    await ctx.process(ctx.config.pythonExecutable, [path.join(ctx.root, TOOL, 'bake_progress_review.py'), output]);
    await withGameBrowser(ctx, { width: 2880, height: 588 }, async page => {
        for (const sheet of await read(path.join(output, 'sheets.json'))) {
            await page.setViewportSize({ width: sheet.width, height: sheet.height });
            const src = 'data:image/png;base64,' + (await readFile(sheet.file)).toString('base64');
            await page.setContent(`<html><body style="margin:0"><img style="display:block" src="${src}">${sheet.labels.map((label, index) => `<span style="position:absolute;top:12px;left:${index * sheet.width / sheet.labels.length + 16}px;color:#d9e3ed;font:22px Arial">${label}</span>`).join('')}</body></html>`);
            await page.evaluate(() => document.images[0].decode());
            await page.screenshot({ path: sheet.file });
        }
    });
    await writeJson(path.join(output, 'timing.json'), { analysisSeconds: (performance.now() - started) / 1000, reusedImages: true, newRenders: 0 });
    const file = path.join(output, 'bake_progress_receipt.json');
    return resultFiles(await receipt(file, ctx.key, { output, diagnosticOnly: true }, await listFiles(output)), file);
}
