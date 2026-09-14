// Measure material variants on frozen reference masks, retaining fixed display controls.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { withGameBrowser } from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import { writeJson, listFiles } from '../../../baking/Files.mjs';
import { outputPath, TOOL } from './Baseline.mjs';

const read = async file => JSON.parse(await readFile(file, 'utf8'));
const comparable = value => JSON.stringify(value).replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://localhost');

export async function materialResponseAnalysis(ctx) {
    if (ctx.publish || !['capture', 'control', 'output'].every(key => ctx.options[key])) throw new Error('capture, control, new output required; diagnostic only');
    const capture = outputPath(ctx.root, ctx.options.capture), control = outputPath(ctx.root, ctx.options.control);
    await authenticated(path.join(capture, 'capture_receipt.json'));
    await authenticated(path.join(control, 'bake_progress_receipt.json'));
    const report = await read(path.join(capture, 'review.json')), reference = await read(path.join(control, 'request.json'));
    for (const run of report.runs) {
        const pose = reference.poses.find(pose => pose.id === run.pose);
        if (!pose) throw new Error('Unknown reference pose: ' + run.pose);
        const original = pose.records[reference.sources.findIndex(source => source.role === 'current')];
        for (const key of ['actualPose', 'viewport', 'projectionMatrix', 'lighting', 'atmosphere', 'graphics', 'sourceHashes']) {
            if (comparable(run.evidence[key]) !== comparable(original[key])) throw new Error(`${run.pose}: ${key} differs from frozen control`);
        }
        if (run.evidence.baked.status.effectiveMode !== 'baked' || run.evidence.baked.receiverLightmaps.activationBlend !== 1
            || run.evidence.baked.status.profileId !== original.baked.status.profileId) throw new Error('Bake changed during material test');
    }
    const output = outputPath(ctx.root, ctx.options.output);
    await mkdir(output);
    await writeJson(path.join(output, 'request.json'), { capture, control, report,
        policy: 'Reuse eroded opaque material masks and fixed Cycles PNGs from authenticated control. Material response study; not an irradiance parity score.' });
    await ctx.process(ctx.config.pythonExecutable, [path.join(ctx.root, TOOL, 'material_response_analysis.py'), output]);
    await withGameBrowser(ctx, { width: 1920, height: 588 }, async page => {
        for (const pose of report.validation ? report.poses : []) {
            const panels = [['Current game', path.join(capture, `${pose.id}-reflections.png`)], ['Cycles reference', path.join(control, 'images', `${pose.id}_cycles.png`)]];
            const images = await Promise.all(panels.map(async ([label, file]) => ({ label, src: 'data:image/png;base64,' + (await readFile(file)).toString('base64') })));
            await page.setContent(`<html><body style="margin:0;display:flex;background:#101921;color:#d8e0e7;font:22px Arial">${images.map(image => `<section style="width:960px"><header style="height:48px;box-sizing:border-box;padding:12px">${pose.id} | ${image.label}</header><img style="display:block;width:960px;height:540px" src="${image.src}"></section>`).join('')}</body></html>`);
            await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
            await page.screenshot({ path: path.join(output, `${pose.id}.png`) });
        }
        for (const sheet of await read(path.join(output, 'facade_sheets.json'))) {
            const images = await Promise.all(sheet.panels.map(async panel => ({ ...panel,
                src: 'data:image/png;base64,' + (await readFile(panel.file)).toString('base64') })));
            await page.setViewportSize({ width: sheet.width, height: sheet.height });
            await page.setContent(`<html><body style="margin:0;display:flex;background:#101921;color:#d8e0e7;font:14px Arial">${images.map(image => `<section><header style="height:40px;box-sizing:border-box;padding:10px">${image.label}</header><img style="display:block" src="${image.src}"></section>`).join('')}</body></html>`);
            await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
            await page.screenshot({ path: sheet.file });
        }
    });
    const file = path.join(output, 'analysis_receipt.json');
    return resultFiles(await receipt(file, ctx.key, { output, diagnosticOnly: true }, await listFiles(output)), file);
}
